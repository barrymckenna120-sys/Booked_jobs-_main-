import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getOrgBranding } from "../_shared/orgBranding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { service_call_id } = await req.json();
    if (!service_call_id) {
      return new Response(JSON.stringify({ error: "service_call_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbHeaders = { apikey: SRK, Authorization: `Bearer ${SRK}` };

    // Fetch job + customer
    const jobRes = await fetch(
      `${SUPABASE_URL}/rest/v1/service_calls?id=eq.${service_call_id}&select=organisation_id,customer_id,cancellation_reason,assigned_engineer_id,assigned_engineer,customers(name,phone,opted_out)&limit=1`,
      { headers: sbHeaders },
    );
    const jobRows = await jobRes.json();
    const job = Array.isArray(jobRows) ? jobRows[0] : null;
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer = job.customers;
    if (!customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (customer.opted_out) {
      return new Response(JSON.stringify({ message: "Customer opted out" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = job.organisation_id;
    const cancellationReason = job.cancellation_reason || "No reason provided";

    // WhatsApp api_key — shared resolver: handles api_key_secret and api_key,
    // on either the 360messenger or whatsapp integration row.
    const wa = await fetchWhatsappApiKey(SUPABASE_URL, SRK, orgId);
    if (!wa.apiKey) {
      return new Response(
        JSON.stringify({ error: `WhatsApp not configured: ${wa.detail}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const apiKey = wa.apiKey;


    const firstName = String(customer.name || "").trim().split(/\s+/)[0] || "there";

    let phone = String(customer.phone || "").replace(/\s+/g, "");
    if (phone.startsWith("+")) phone = phone.slice(1);
    if (phone.startsWith("0")) phone = "353" + phone.slice(1);

    const branding = await getOrgBranding(SUPABASE_URL, SRK, orgId);
    const rebookLine = branding.phone ? `To rebook please call us on ${branding.phone}.\n\n` : "";
    const message = `Hi ${firstName}, your booking with ${branding.name} has been cancelled.\n\nReason: ${cancellationReason}\n\n${rebookLine}${branding.footer || branding.name}`;

    const fd = new FormData();
    fd.append("phonenumber", phone);
    fd.append("text", message);

    const waRes = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
    const waText = await waRes.text();
    const status = waRes.ok ? "sent" : "failed";

    // Log to message_log (same source as Message Log / Chat Inbox History)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/message_log`, {
        method: "POST",
        headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          organisation_id: orgId,
          customer_id: (job as any).customer_id ?? null,
          message_type: "cancellation",
          channel: "whatsapp",
          direction: "outbound",
          content: message,
          status,
          related_id: service_call_id,
          related_type: "service_call",
          sent_by: "system",
          sent_at: new Date().toISOString(),
        }),
      });
    } catch (_e) { /* non-critical */ }

    if (!waRes.ok) {
      return new Response(
        JSON.stringify({ error: `WhatsApp send failed: ${waText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark sent
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/service_calls?id=eq.${service_call_id}`, {
        method: "PATCH",
        headers: {
          ...sbHeaders,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ cancellation_notice_sent: true }),
      });
    } catch (_e) { /* non-critical */ }

    // Notify assigned engineer in-app
    try {
      const engineerId = (job as any).assigned_engineer_id;
      if (engineerId && orgId) {
        const engRes = await fetch(
          `${SUPABASE_URL}/rest/v1/engineers?id=eq.${engineerId}&select=auth_user_id,user_id,name&limit=1`,
          { headers: sbHeaders },
        );
        const engRows = await engRes.json();
        const recipient = Array.isArray(engRows)
          ? (engRows[0]?.auth_user_id || engRows[0]?.user_id)
          : null;
        if (recipient) {
          await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
            method: "POST",
            headers: { ...sbHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient_user_id: recipient,
              organisation_id: orgId,
              notification_type: "cancelled",
              title: "Job Cancelled",
              body: `Job for ${customer.name || "customer"} cancelled. Reason: ${cancellationReason}`,
              role: "engineer",
              job_id: service_call_id,
              metadata: { service_call_id, cancellation_reason: cancellationReason },
            }),
          });
        }
      }
    } catch (_e) { /* non-critical */ }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: (_e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
