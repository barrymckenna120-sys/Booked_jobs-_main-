import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";
import { signDocumentUrl, extractStoragePath } from "../_shared/signDocumentUrl.ts";

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
    const { certificate_id } = await req.json();
    if (!certificate_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing certificate_id" }), {
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

    // Fetch certificate (incl. organisation_id)
    const certRes = await fetch(
      `${supabaseUrl}/rest/v1/certificates?id=eq.${certificate_id}&select=id,cert_number,pdf_url,customer_id,job_id,notes,organisation_id,access_token`,
      { headers }
    );
    const certs = await certRes.json();
    const cert = Array.isArray(certs) ? certs[0] : null;
    if (!cert) {
      return new Response(JSON.stringify({ success: false, error: "Certificate not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    if (!cert.pdf_url) {
      return new Response(JSON.stringify({ success: false, error: "PDF not yet generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Fetch customer
    const custRes = await fetch(
      `${supabaseUrl}/rest/v1/customers?id=eq.${cert.customer_id}&select=name,phone`,
      { headers }
    );
    const custs = await custRes.json();
    const customer = Array.isArray(custs) ? custs[0] : null;
    if (!customer || !customer.phone) {
      return new Response(JSON.stringify({ success: false, error: "Customer or phone not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    // Derive organisation_id (required) — prefer certificate, fallback to job
    let orgId: string | null = cert.organisation_id || null;

    // Fetch job to get user_id (and org fallback)
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${cert.job_id}&select=user_id,organisation_id`,
      { headers }
    );
    const jobs = await jobRes.json();
    const job = Array.isArray(jobs) ? jobs[0] : null;
    const userId = job?.user_id;
    if (!orgId) orgId = job?.organisation_id || null;

    if (!orgId) {
      return new Response(JSON.stringify({ success: false, error: "organisation_id missing on certificate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Lookup WhatsApp api_key from tenant_integrations
    const integRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      { headers }
    );
    const integRows = await integRes.json();
    const integConfig = Array.isArray(integRows) && integRows[0]?.config ? integRows[0].config : null;
    let apiKey: string | null = integConfig?.api_key || null;
    if (!apiKey && integConfig?.api_key_secret) {
      apiKey = Deno.env.get(integConfig.api_key_secret) || null;
    }

    // Extract calling user from JWT for activity logging
    let callingProfileId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const payload = JSON.parse(atob(token.split(".")[1]));
        const callingUserId = payload.sub;
        if (callingUserId) {
          const profileRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?user_id=eq.${callingUserId}&select=id&limit=1`,
            { headers }
          );
          const profiles = await profileRes.json();
          if (Array.isArray(profiles) && profiles[0]) {
            callingProfileId = profiles[0].id;
          }
        }
      } catch { /* ignore JWT parse errors */ }
    }

    // Derive certificate type label from notes.cert_type with cert_number prefix fallback
    const certTypeRaw = (cert.notes && typeof cert.notes === "object" && (cert.notes as any).cert_type) || "";
    const certTypeLabel = (() => {
      // Primary: check notes.cert_type
      if (certTypeRaw === "gas_installation_new_meter") return "Gas Installation / New Meter Certificate";
      if (certTypeRaw === "declaration_of_conformance") return "Declaration of Conformance Certificate";
      if (certTypeRaw === "domestic_safety_service") return "Domestic Safety / Service Certificate";
      // Fallback: check cert_number prefix
      const cn = (cert.cert_number || "").toUpperCase();
      if (cn.startsWith("GI-")) return "Gas Installation / New Meter Certificate";
      if (cn.startsWith("DS-")) return "Domestic Safety / Service Certificate";
      if (cn.startsWith("DC-")) return "Declaration of Conformance Certificate";
      return "Gas Service Certificate";
    })();

    console.log("[send-certificate-whatsapp] cert_type_raw:", certTypeRaw, "cert_number:", cert.cert_number, "label:", certTypeLabel);

    // Fetch settings: message_footer + template_certificate. No shared footer
    // fallback: a blank footer skips-and-logs (BJ-B2c).
    let messageFooter = "";
    const defaultTemplate = `Hi {{customer_name}}, please find your ${certTypeLabel} {{certificate_number}}.\n\nThis certificate confirms all work has been completed in accordance with Irish gas safety standards.\n\nPlease keep this for your records.\n\nThank you for choosing us. 🔧\n\n📄 View Certificate:\n{{certificate_url}}`;
    let messageTemplate = defaultTemplate;

    {
      const settingsRes = await fetch(
        `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer,template_certificate&limit=1`,
        { headers }
      );
      const settings = await settingsRes.json();
      if (Array.isArray(settings) && settings[0]) {
        if (settings[0].message_footer) messageFooter = settings[0].message_footer;
        if (settings[0].template_certificate) messageTemplate = settings[0].template_certificate;
      }
    }
    messageFooter = String(messageFooter).trim();

    if (!messageFooter) {
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          function_name: "send-certificate-whatsapp",
          error_message: "Skipped: message_footer_not_configured for organisation",
          payload: {
            organisation_id: orgId,
            cert_number: cert.cert_number,
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

    // Resolve tenant public URL for the certificate using the unguessable
    // access_token; null when the org has no public_domain configured — we
    // still send the message, just without the "View Certificate" link.
    const tenantCertUrl = cert.access_token
      ? await getTenantPublicUrl(supabaseUrl, orgId, `/certificates/${cert.access_token}`)
      : null;
    if (cert.access_token && !tenantCertUrl) {
      console.warn(`[send-certificate-whatsapp] organisation ${orgId} has no public_domain; omitting certificate link`);
    }
    // If no tenant URL, strip the whole line containing {{certificate_url}}
    // from the template so the message doesn't render an empty "View Certificate:" line.
    let effectiveTemplate = messageTemplate;
    if (!tenantCertUrl) {
      effectiveTemplate = effectiveTemplate.replace(/\n?[^\n]*\{\{certificate_url\}\}[^\n]*/g, "");
    }
    let message = effectiveTemplate
      .replace(/\{\{customer_name\}\}/g, firstName)
      .replace(/\{\{certificate_number\}\}/g, cert.cert_number || "")
      .replace(/\{\{certificate_type\}\}/g, certTypeLabel)
      .replace(/Gas Service Certificate/gi, certTypeLabel)
      .replace(/Gas Safety Certificate/gi, certTypeLabel)
      .replace(/Boiler Service Certificate/gi, certTypeLabel)
      .replace(/\{\{certificate_url\}\}/g, tenantCertUrl || "");

    // Append dynamic footer
    message += `\n\n${messageFooter}`;

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        customer_id: cert.customer_id,
        organisation_id: orgId,
        message_type: "certificate",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        related_id: certificate_id,
        related_type: "certificate",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    if (!apiKey) {
      if (logId) {
        await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "failed", error_message: "WhatsApp api_key not configured for organisation" }),
        });
      }
      return new Response(JSON.stringify({ success: false, error: "WhatsApp API key not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Send via 360Messenger. Mint a short-lived signed URL for the PDF
    // attachment so we work whether the bucket is public or private.
    const certObjectPath = extractStoragePath("certificates", cert.pdf_url);
    const signedDocUrl = certObjectPath
      ? await signDocumentUrl("certificates", certObjectPath, 3600)
      : null;
    const docUrl = signedDocUrl || cert.pdf_url;

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

    // Update message_log status
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

    // Log customer_activity on success
    if (result.success && cert.customer_id && cert.job_id) {
      const certLabel = cert.cert_number ? `Certificate sent — ${cert.cert_number}` : "Certificate sent — Boiler Service";
      
      await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          organisation_id: orgId,
          customer_id: cert.customer_id,
          service_call_id: cert.job_id,
          event_type: "certificate_sent",
          event_label: certLabel,
          created_by: callingProfileId,
        }),
      });
    }

    // On failure: log error + create notification
    if (!result.success) {
      const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`;

      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          function_name: "send-certificate-whatsapp",
          error_message: `360Messenger API returned success:false. HTTP ${response.status}`,
          payload: { api_response: result, sent_to: customer.phone, certificate_id },
        }),
      });

      if (userId) {
        const usersRes = await fetch(
          `${supabaseUrl}/rest/v1/engineers?user_id=eq.${userId}&role=in.(admin,office)&auth_user_id=not.is.null&select=auth_user_id`,
          { headers }
        );
        const adminUsers = await usersRes.json();

        const recipientIds = new Set<string>();
        recipientIds.add(userId);
        if (Array.isArray(adminUsers)) {
          adminUsers.forEach((u: any) => { if (u.auth_user_id) recipientIds.add(u.auth_user_id); });
        }

        for (const recipientId of recipientIds) {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              recipient_user_id: recipientId,
              notification_type: "message",
              title: "⚠️ Certificate WhatsApp Failed",
              body: `Failed to send certificate ${cert.cert_number} to ${customer.name} (${customer.phone}). Error: ${errorDetail.substring(0, 200)}`,
              role: "office",
              metadata: { certificate_id, cert_number: cert.cert_number, customer_name: customer.name, phone: customer.phone, error: errorDetail.substring(0, 200) },
            }),
          });
        }
      }
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
