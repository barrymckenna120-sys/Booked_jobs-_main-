import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import {
  consentSkipResponse,
  requireCustomerMessagingConsent,
} from "../_shared/messagingConsent.ts";
import { getCorsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // NOTE: customer_phone is deliberately NOT read from the body — the recipient
    // is always the DB-stored number resolved by the consent gate below.
    const { job_id, customer_name, follow_up_detail, message: customMessage } = await req.json();

    // IDOR guard: prove the caller belongs to the organisation owning this row
    // before acting with that tenant's credentials.
    const access = await requireResourceOrgAccess(req, {
      fnName: "send-part-arrived",
      cors: corsHeaders,
      resource: { table: "service_calls", id: job_id },
    });
    if (isDenied(access)) return access.error;

    if (!job_id) {
      return new Response(
        JSON.stringify({ success: false, error: "job_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Fetch job to get organisation_id
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${job_id}&select=organisation_id,customer_id`,
      { headers }
    );
    const jobs = await jobRes.json();
    const jobRow = Array.isArray(jobs) ? jobs[0] : null;
    const orgId = jobRow?.organisation_id;

    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: "Service call missing organisation_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Consent gate: opted_out is authoritative, and the recipient number always
    // comes from the DB row — never from the request body.
    const consent = await requireCustomerMessagingConsent({
      fnName: "send-part-arrived",
      orgId,
      customerId: jobRow?.customer_id,
    });
    if (!consent.allowed) return consentSkipResponse(consent.reason, corsHeaders);
    const recipientPhone = consent.phone;
    const recipientName = consent.name || customer_name || "there";



    // Resolve per-tenant 360Messenger credentials.
    // Accepts either integration row type, and either a declared secret name
    // (api_key_secret -> env var) or a literal api_key stored in config.
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=in.(360messenger,whatsapp)&select=integration_type,config`,
      { headers }
    );
    const tiRows = await tiRes.json();
    const rows: any[] = Array.isArray(tiRows) ? tiRows : [];
    const preferred = rows.find((r) => r.integration_type === "360messenger") || rows[0] || null;
    const cfg = preferred?.config || {};

    let apiKey: string | null = null;
    let resolution = "none";
    let secretName: string | undefined;

    if (cfg.api_key_secret) {
      secretName = String(cfg.api_key_secret);
      apiKey = Deno.env.get(secretName) || null;
      resolution = apiKey ? `secret:${secretName}` : `secret_missing:${secretName}`;
    } else if (cfg.api_key) {
      apiKey = String(cfg.api_key);
      resolution = "literal_config";
    } else {
      // Fall back to a literal key on the other integration row, if present.
      const other = rows.find((r) => r !== preferred);
      if (other?.config?.api_key) {
        apiKey = String(other.config.api_key);
        resolution = `literal_config:${other.integration_type}`;
      }
    }

    if (!apiKey) {
      const detail = rows.length === 0
        ? "No 360messenger/whatsapp integration row for this organisation"
        : secretName
          ? `Secret "${secretName}" is not set for this organisation`
          : "Integration row has no api_key or api_key_secret";
      try {
        await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            function_name: "send-part-arrived",
            error_message: `WhatsApp credential resolution failed: ${detail}`,
            payload: { organisation_id: orgId, job_id, resolution, secret_name: secretName ?? null },
          }),
        });
      } catch { /* best-effort */ }
      return new Response(
        JSON.stringify({ success: false, error: `WhatsApp not configured: ${detail}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch message_footer from settings (by organisation_id) with org-aware fallbacks.
    // Office-initiated one-off send: degrade (omit footer) rather than block the send.
    let messageFooter = "";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer,business_name,company_name&limit=1`,
      { headers }
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]) {
      messageFooter = (settings[0].message_footer || settings[0].business_name || settings[0].company_name || "").trim();
    }
    if (!messageFooter) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            function_name: "send-part-arrived",
            error_message: `Branding not configured for org ${orgId} — sent without footer`,
            payload: { organisation_id: orgId, job_id, reason: "message_footer_not_configured", degraded: true },
          }),
        });
      } catch { /* best-effort */ }
    }

    const firstName = String(recipientName).split(" ")[0];
    // Phase 3: body from the canonical catalogue. customMessage override and
    // footer degrade behaviour are unchanged.
    const message = buildCatalogueMessage("part_arrived", {
      firstName,
      follow_up_detail,
      customMessage,
      messageFooter,
    });


    // Log to message_log
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        customer_id: jobRow.customer_id,
        organisation_id: orgId,
        message_type: "part_arrived",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        related_id: job_id,
        related_type: "service_call",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    const cleanNumber = recipientPhone.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: any;
    try {
      result = JSON.parse(resultText);
    } catch {
      result = { success: false, raw: resultText };
    }

    // Log full API response to edge_function_logs for debugging
    await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        function_name: "send-part-arrived",
        error_message: `360Messenger HTTP ${response.status}: ${result.success ? "success" : "failed"}`,
        payload: { api_response: result, sent_to: recipientPhone, job_id, http_status: response.status },
      }),
    });

    if (logId) {
      const updateBody = result.success
        ? { status: "sent" }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };
      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(updateBody),
      });
    }

    // Log customer activity on success
    if (result.success && jobRow?.customer_id) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
          method: "POST", headers,
          body: JSON.stringify({
            organisation_id: orgId,
            customer_id: jobRow.customer_id,
            service_call_id: job_id,
            event_type: "whatsapp_sent",
            event_label: "WhatsApp sent — Part Arrived",
          }),
        });
      } catch { /* non-critical */ }
    }

    return new Response(
      JSON.stringify({ success: true, customer_name: recipientName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
