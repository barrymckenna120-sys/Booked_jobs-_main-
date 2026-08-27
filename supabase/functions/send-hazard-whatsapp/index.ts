import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchWhatsappApiKey } from "../_shared/whatsappCredentials.ts";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";
import { signDocumentUrl, extractStoragePath } from "../_shared/signDocumentUrl.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import {
  consentSkipResponse,
  requireCustomerMessagingConsent,
} from "../_shared/messagingConsent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hazard_id } = await req.json();

    // IDOR guard: prove the caller belongs to the organisation owning this row
    // before acting with that tenant's credentials.
    const access = await requireResourceOrgAccess(req, {
      fnName: "send-hazard-whatsapp",
      cors: corsHeaders,
      resource: { table: "hazard_notifications", id: hazard_id },
    });
    if (isDenied(access)) return access.error;
    if (!hazard_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing hazard_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Fetch hazard notification
    const hazardRes = await fetch(
      `${supabaseUrl}/rest/v1/hazard_notifications?id=eq.${hazard_id}&select=id,ref_number,pdf_url,customer_id,job_id,organisation_id,access_token`,
      { headers }
    );
    const hazards = await hazardRes.json();
    const hazard = Array.isArray(hazards) ? hazards[0] : null;
    if (!hazard) {
      return new Response(JSON.stringify({ success: false, error: "Hazard notification not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    if (!hazard.pdf_url) {
      return new Response(JSON.stringify({ success: false, error: "PDF not yet generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Consent gate: loads the customer server-side scoped to the acting org,
    // honours customers.opted_out, and yields the DB-stored recipient number.
    const consent = await requireCustomerMessagingConsent({
      fnName: "send-hazard-whatsapp",
      orgId: access.orgId,
      customerId: hazard.customer_id,
    });
    if (!consent.allowed) return consentSkipResponse(consent.reason, corsHeaders);
    const customer = { name: consent.name ?? "", phone: consent.phone };

    // Fetch job to get organisation_id + engineer
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${hazard.job_id}&select=organisation_id,assigned_engineer_id`,
      { headers }
    );
    const jobs = await jobRes.json();
    const job = Array.isArray(jobs) ? jobs[0] : null;
    const orgId = job?.organisation_id;

    if (!orgId) {
      return new Response(JSON.stringify({ success: false, error: "Service call missing organisation_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // WhatsApp api_key via shared resolver (api_key_secret or api_key, either row type)
    const wa = await fetchWhatsappApiKey(supabaseUrl, supabaseKey, orgId);
    if (!wa.apiKey) {
      return new Response(JSON.stringify({ success: false, error: `WhatsApp not configured: ${wa.detail}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }
    const apiKey = wa.apiKey;


    // Fetch engineer name
    let engineerName = "your engineer";
    if (job?.assigned_engineer_id) {
      const engRes = await fetch(
        `${supabaseUrl}/rest/v1/engineers?id=eq.${job.assigned_engineer_id}&select=name`,
        { headers }
      );
      const engs = await engRes.json();
      if (Array.isArray(engs) && engs[0]?.name) engineerName = engs[0].name;
    }

    // Fetch settings for message_footer (by organisation_id). No shared
    // fallback: a blank footer skips-and-logs (BJ-B2c).
    let messageFooter = "";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer&limit=1`,
      { headers }
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]?.message_footer) {
      messageFooter = settings[0].message_footer;
    }
    messageFooter = String(messageFooter).trim();

    if (!messageFooter) {
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          function_name: "send-hazard-whatsapp",
          error_message: "Skipped: message_footer_not_configured for organisation",
          payload: {
            organisation_id: orgId,
            hazard_id: hazard.id,
            reason: "message_footer_not_configured",
          },
        }),
      });
      return new Response(
        JSON.stringify({
          success: false,
          whatsapp_sent: false,
          skipped: true,
          reason: "message_footer_not_configured",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }


    const firstName = customer.name.split(" ")[0];

    // Public tenant link keyed by access_token (null if org has no public_domain)
    const tenantHazardUrl = hazard.access_token
      ? await getTenantPublicUrl(supabaseUrl, orgId, `/hazard/${hazard.access_token}`)
      : null;
    if (hazard.access_token && !tenantHazardUrl) {
      console.warn(`[send-hazard-whatsapp] organisation ${orgId} has no public_domain; omitting hazard link`);
    }

    // Signed URL for the 360Messenger doc attachment (works when bucket is
    // public or private).
    const hazardObjectPath = extractStoragePath("certificates", hazard.pdf_url);
    const signedDocUrl = hazardObjectPath
      ? await signDocumentUrl("certificates", hazardObjectPath, 3600)
      : null;
    const docUrl = signedDocUrl || hazard.pdf_url;

    const linkLine = tenantHazardUrl ? `\n\n📄 View Document:\n${tenantHazardUrl}` : "";
    const message = `Hi ${firstName}, please find attached your Gas Installation Notification of Hazard/Non-Conformance from ${engineerName}.${linkLine}\n\n${messageFooter}`;

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        organisation_id: orgId,
        customer_id: hazard.customer_id,
        message_type: "hazard_notification",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        related_id: hazard_id,
        related_type: "hazard_notification",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    // Send via 360Messenger
    const cleanNumber = customer.phone.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);
    formData.append("doc_url", docUrl);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: any;
    try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }

    if (logId) {
      const updateBody = result.success
        ? { status: "sent" }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };
      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH", headers, body: JSON.stringify(updateBody),
      });
    }

    if (!result.success) {
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST", headers,
        body: JSON.stringify({
          function_name: "send-hazard-whatsapp",
          error_message: `360Messenger API returned success:false. HTTP ${response.status}`,
          payload: { api_response: result, sent_to: customer.phone, hazard_id },
        }),
      });
    } else {
      // Log customer activity
      try {
        await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
          method: "POST", headers,
          body: JSON.stringify({
            organisation_id: orgId,
            customer_id: hazard.customer_id,
            event_type: "whatsapp_sent",
            event_label: "WhatsApp sent — Hazard Notification",
          }),
        });
      } catch { /* non-critical */ }
    }

    return new Response(JSON.stringify({
      success: result.success,
      error_detail: result.success ? undefined : `360Messenger HTTP ${response.status}: ${resultText.substring(0, 300)}`,
      customer_name: customer.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
