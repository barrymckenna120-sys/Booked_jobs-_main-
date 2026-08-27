import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWhatsappApiKeyWithClient } from "../_shared/whatsappCredentials.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireMachineCaller } from "../_shared/machineAuth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Machine callers only (pg_cron service-role bearer / shared webhook secret).
  const denied = requireMachineCaller(req, corsHeaders, "send-deposit-reminder");
  if (denied) return denied;


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Per-org WhatsApp api_key cache
    const apiKeyCache = new Map<string, string | null>();
    const loadApiKey = async (orgId: string): Promise<string | null> => {
      if (apiKeyCache.has(orgId)) return apiKeyCache.get(orgId)!;
      const wa = await fetchWhatsappApiKeyWithClient(supabase as any, orgId);
      const key = wa.apiKey;
      apiKeyCache.set(orgId, key);
      return key;

    };

    // 4-5 days ago window
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error: jobsErr } = await supabase
      .from("service_calls")
      .select("id, payment_link, customer_id, organisation_id, customers(name, phone, opted_out)")
      .or("deposit_paid.eq.false,deposit_paid.is.null")
      .not("payment_link", "is", null)
      .gte("created_at", fiveDaysAgo)
      .lte("created_at", fourDaysAgo);

    if (jobsErr) {
      console.error("Query error:", jobsErr);
      return new Response(JSON.stringify({ error: jobsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reminded = 0;
    let skipped = 0;

    for (const job of jobs || []) {
      const customer = job.customers as any;
      if (!customer || !customer.phone || customer.opted_out === true) {
        skipped++;
        continue;
      }

      const orgId = (job as any).organisation_id;
      if (!orgId) {
        skipped++;
        continue;
      }

      const messengerKey = await loadApiKey(orgId);
      if (!messengerKey) {
        skipped++;
        continue;
      }

      const { data: messengerConfig } = await supabase
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", orgId)
        .eq("integration_type", "360messenger")
        .maybeSingle();
      // Tenant branding — this org's own config only, no shared fallback (BJ-B2b).
      const companyName = String((messengerConfig?.config as any)?.company_name ?? "").trim();
      const companyPhone = String((messengerConfig?.config as any)?.company_phone ?? "").trim();
      const missingConfig = !companyName
        ? "company_name_not_configured"
        : !companyPhone
          ? "company_phone_not_configured"
          : null;

      if (missingConfig) {
        await supabase.from("edge_function_logs").insert({
          function_name: "send-deposit-reminder",
          error_message: `Skipped: ${missingConfig} for organisation`,
          payload: { organisation_id: orgId, service_call_id: job.id, reason: missingConfig },
        });
        skipped++;
        continue;
      }

      const message = `Hi ${customer.name}, this is a reminder that your deposit payment is still outstanding for your booking with ${companyName}.\n\nPlease pay securely here: ${job.payment_link}\n\nIf you have any questions please reply to this message.\n\n${companyName} ☎ ${companyPhone}`;

      const cleanNumber = customer.phone.replace(/^\+/, "");
      const formData = new FormData();
      formData.append("phone_number", cleanNumber);
      formData.append("text", message);

      // Log to message_log (pending)
      const { data: logRows } = await supabase.from("message_log").insert({
        organisation_id: orgId,
        channel: "whatsapp",
        message_type: "deposit_reminder",
        customer_id: job.customer_id,
        related_id: job.id,
        related_type: "service_call",
        content: message,
        sent_by: "system",
        status: "pending",
        direction: "outbound",
      }).select("id");

      const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

      const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${messengerKey}` },
        body: formData,
      });

      const resultText = await response.text();
      let result: any;
      try {
        result = JSON.parse(resultText);
      } catch (_e) {
        result = { success: false };
      }

      if (logId) {
        const updateBody = result.success
          ? { status: "sent", sent_at: new Date().toISOString() }
          : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };
        await supabase.from("message_log").update(updateBody).eq("id", logId);
      }

      if (result.success) {
        reminded++;
        // Log customer activity
        try {
          await supabase.from("customer_activity").insert({
            organisation_id: orgId,
            customer_id: job.customer_id,
            service_call_id: job.id,
            event_type: "whatsapp_sent",
            event_label: "WhatsApp sent — Deposit Reminder",
          });
        } catch { /* non-critical */ }
      } else {
        skipped++;
        await supabase.from("edge_function_logs").insert({
          function_name: "send-deposit-reminder",
          error_message: `360Messenger failed. HTTP ${response.status}`,
          payload: { sent_to: cleanNumber, service_call_id: job.id },
        });
      }
    }

    console.log(`Deposit reminders: reminded=${reminded}, skipped=${skipped}`);

    return new Response(JSON.stringify({ reminded, skipped }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-deposit-reminder error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
