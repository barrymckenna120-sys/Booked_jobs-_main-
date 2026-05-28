import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, customer_name, customer_phone, follow_up_detail, message: customMessage } = await req.json();

    if (!job_id || !customer_name || !customer_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
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

    // Fetch WhatsApp api_key from tenant_integrations
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      { headers }
    );
    const tiRows = await tiRes.json();
    const apiKey = (Array.isArray(tiRows) && tiRows[0]?.config?.api_key) || null;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp integration not configured for this organisation" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch message_footer from settings (by organisation_id) with org-aware fallbacks
    let messageFooter = "our team";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer,business_name,company_name&limit=1`,
      { headers }
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]) {
      messageFooter = settings[0].message_footer || settings[0].business_name || settings[0].company_name || messageFooter;
    }

    const firstName = customer_name.split(" ")[0];
    const baseMessage = customMessage || `Hi ${firstName}, great news! The part we ordered for your boiler has arrived. 🔧\n\nWe'd like to arrange a time to come back and complete the work.\n\nDetails: ${follow_up_detail || "Follow-up repair"}\n\nPlease reply to this message or call us to book a time that suits you.`;
    const message = `${baseMessage}\n\n${messageFooter}`;

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

    const cleanNumber = customer_phone.replace(/^\+/, "");
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
        payload: { api_response: result, sent_to: customer_phone, job_id, http_status: response.status },
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
      JSON.stringify({ success: true, customer_name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
