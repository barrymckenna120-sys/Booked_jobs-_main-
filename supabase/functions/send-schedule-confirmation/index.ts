import { createClient } from "npm:@supabase/supabase-js@2";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import {
  consentSkipBody,
  requireCustomerMessagingConsent,
} from "../_shared/messagingConsent.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { service_call_id } = await req.json();
    if (!service_call_id) return json({ error: "service_call_id is required" }, 400);

    // IDOR guard: authenticate the caller and prove they own this job.
    const access = await requireResourceOrgAccess(req, {
      fnName: "send-schedule-confirmation",
      cors: corsHeaders,
      resource: { table: "service_calls", id: service_call_id },
    });
    if (isDenied(access)) return access.error;

    // 1. Fetch job
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, organisation_id, scheduled_date, time_block, customer_id, assigned_engineer_id, assigned_engineer")
      .eq("id", service_call_id)
      .maybeSingle();

    if (jobErr || !job) return json({ error: "Job not found", detail: jobErr?.message }, 404);

    // Consent gate (single shared implementation).
    const consent = await requireCustomerMessagingConsent({
      fnName: "send-schedule-confirmation",
      orgId: access.orgId,
      customerId: job.customer_id,
    });
    if (!consent.allowed) {
      if (consent.reason === "customer_wrong_organisation") {
        return json({ error: "Forbidden" }, 403);
      }
      return json(consentSkipBody(consent.reason));
    }
    const customer = { name: consent.name ?? "", phone: consent.phone };

    // Engineer
    let engineerName = job.assigned_engineer || "TBC";
    if (job.assigned_engineer_id) {
      const { data: eng } = await supabase
        .from("engineers")
        .select("name")
        .eq("id", job.assigned_engineer_id)
        .maybeSingle();
      if (eng?.name) engineerName = eng.name;
    }

    // 2. WhatsApp integration
    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", job.organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const messengerSettings = (integration?.config as any) ?? {};
    const apiKeySecretName = messengerSettings.api_key_secret as string | undefined;
    // Never fall back to another tenant's key: if this org declares a secret name,
    // that secret is the only acceptable credential.
    // Tenant credentials only — no shared/global key fallback.
    const apiKey = apiKeySecretName
      ? Deno.env.get(apiKeySecretName)
      : (messengerSettings.api_key as string | undefined);
    if (!apiKey) return json({ error: "WhatsApp API key not configured for this organisation" }, 400);


    // 2b. Branding from settings
    const { data: settingsRow } = await supabase
      .from("settings")
      .select("company_name, company_phone, message_footer")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();

    const companyName = (settingsRow as any)?.company_name ?? "";
    const companyPhone = (settingsRow as any)?.company_phone ?? "";

    // 3. Format date
    let scheduledDate = "TBC";
    if (job.scheduled_date) {
      const d = new Date(`${job.scheduled_date}T12:00:00`);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      scheduledDate = `${dd}/${mm}/${yyyy}`;
    }

    const timeSlot = job.time_block || "TBC";

    // 4. First name
    const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

    // 5. Normalise phone
    let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (phone.startsWith("0")) phone = "353" + phone.substring(1);

    // 6. Build message
    const confirmedWith = companyName ? ` with ${companyName}` : "";
    const signoff = [companyName, companyPhone].filter(Boolean).join(" ☎ ");
    const message =
      `Hi ${firstName}, your booking${confirmedWith} is confirmed.\n\n` +
      `📅 Date: ${scheduledDate}\n` +
      `⏰ Time: ${timeSlot}\n` +
      `👷 Engineer: ${engineerName}\n\n` +
      `If you need to make any changes please reply to this message.${signoff ? `\n\n${signoff}` : ""}`;

    // 7. Send via 360 Messenger
    const formData = new FormData();
    formData.append("phonenumber", phone);
    formData.append("text", message);

    const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const respText = await resp.text();
    const ok = resp.ok;

    // 8. Log via log-message edge function
    try {
      await fetch(`${supabaseUrl}/functions/v1/log-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          service_call_id,
          organisation_id: job.organisation_id,
          message_type: "schedule_confirmation",
          recipient_phone: phone,
          message_body: message,
          status: ok ? "success" : "fail",
        }),
      });
    } catch (_e) {
      console.error("log-message invoke failed", _e);
    }

    if (!ok) {
      return json({ error: "Failed to send WhatsApp message", detail: respText }, 502);
    }

    // 9. Mark sent
    await supabase
      .from("service_calls")
      .update({ schedule_confirmation_sent: true })
      .eq("id", service_call_id);

    return json({ success: true });
  } catch (e) {
    console.error("send-schedule-confirmation error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
