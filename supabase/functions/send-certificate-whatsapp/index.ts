import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const apiKey = Deno.env.get("MESSENGER_API_KEY");

    const headers = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Fetch certificate
    const certRes = await fetch(
      `${supabaseUrl}/rest/v1/certificates?id=eq.${certificate_id}&select=id,cert_number,pdf_url,customer_id,job_id`,
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

    // Fetch job to get user_id for settings lookup
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${cert.job_id}&select=user_id`,
      { headers }
    );
    const jobs = await jobRes.json();
    const job = Array.isArray(jobs) ? jobs[0] : null;
    const userId = job?.user_id;

    // Fetch business name from settings
    let businessName = "BookedJobs";
    if (userId) {
      const settingsRes = await fetch(
        `${supabaseUrl}/rest/v1/settings?user_id=eq.${userId}&select=business_name&limit=1`,
        { headers }
      );
      const settings = await settingsRes.json();
      if (Array.isArray(settings) && settings[0]?.business_name) {
        businessName = settings[0].business_name;
      }
    }

    // Fetch certificate template from settings
    let messageTemplate = `Hi {{customer_name}}, please find your Gas Service Certificate {{certificate_number}} from K & N Gas Services Limited.\n\nThis certificate confirms all work has been completed in accordance with Irish gas safety standards.\n\nPlease keep this for your records.\n\nThank you for choosing us. 🔧\n\n📄 View Certificate:\n{{certificate_url}}`;

    if (userId) {
      const tmplRes = await fetch(
        `${supabaseUrl}/rest/v1/settings?user_id=eq.${userId}&select=template_certificate&limit=1`,
        { headers }
      );
      const tmplSettings = await tmplRes.json();
      if (Array.isArray(tmplSettings) && tmplSettings[0]?.template_certificate) {
        messageTemplate = tmplSettings[0].template_certificate;
      }
    }

    const firstName = customer.name.split(" ")[0];
    const message = messageTemplate
      .replace(/\{\{customer_name\}\}/g, firstName)
      .replace(/\{\{certificate_number\}\}/g, cert.cert_number || "")
      .replace(/\{\{certificate_url\}\}/g, cert.pdf_url);

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        customer_id: cert.customer_id,
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
      // Update log as failed
      if (logId) {
        await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "failed", error_message: "MESSENGER_API_KEY not configured" }),
        });
      }
      return new Response(JSON.stringify({ success: false, error: "WhatsApp API key not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
      });
    }

    // Send via 360Messenger
    const cleanNumber = customer.phone.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);
    // Send PDF as document URL
    formData.append("doc_url", cert.pdf_url);

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

      // Notify office users
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
