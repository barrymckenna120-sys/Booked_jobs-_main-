import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { evaluateOptOut } from "../_shared/optOut.ts";


serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { service_call_id } = await req.json();

    if (!service_call_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing service_call_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey!,
      "Content-Type": "application/json",
    };

    // Fetch the service call with customer details
    const scRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${service_call_id}&select=id,customer_id,scheduled_date,time_block,job_type,assigned_engineer,organisation_id`,
      { headers: dbHeaders },
    );
    const scRows = await scRes.json();
    const job = Array.isArray(scRows) ? scRows[0] : null;
    if (!job) {
      return new Response(JSON.stringify({ success: false, error: "Service call not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const orgId = job.organisation_id;
    if (!orgId) {
      return new Response(JSON.stringify({ success: false, error: "Service call missing organisation_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch tenant WhatsApp integration config
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      { headers: dbHeaders },
    );
    const tiRows = await tiRes.json();
    const config = Array.isArray(tiRows) && tiRows[0]?.config ? tiRows[0].config : null;
    if (!config) {
      return new Response(JSON.stringify({ success: false, error: "WhatsApp integration not configured for this organisation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const apiKey = config.api_key || (config.api_key_secret ? Deno.env.get(config.api_key_secret) : null);
    const templateName = config?.templates?.booking_confirmation ?? "booking_confirmation";
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "WhatsApp api_key missing in config (set api_key or api_key_secret)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch customer details
    const custRes = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${job.customer_id}&select=name,phone`, {
      headers: dbHeaders,
    });
    const custRows = await custRes.json();
    const customer = Array.isArray(custRows) ? custRows[0] : null;
    if (!customer) {
      return new Response(JSON.stringify({ success: false, error: "Customer not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    if (!customer.phone) {
      console.warn("send-booking-confirmation skipped: customer has no phone", {
        service_call_id,
        customer_id: job.customer_id,
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_phone" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Fetch settings (message_footer / business_name) by organisation_id
    let messageFooter = "";
    let companyName = "";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer,business_name&limit=1`,
      { headers: dbHeaders },
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]) {
      if (settings[0].message_footer) messageFooter = settings[0].message_footer;
      if (settings[0].business_name) companyName = settings[0].business_name;
    }

    const SALUTATIONS = ["mr", "mrs", "ms", "dr", "miss"];
    const getFirstName = (fullName: string): string => {
      if (!fullName) return "";
      const parts = fullName.trim().split(/\s+/);
      if (parts.length > 1 && SALUTATIONS.includes(parts[0].toLowerCase().replace(/\.$/, ""))) {
        return parts[1];
      }
      return parts[0];
    };
    const firstName = getFirstName(customer.name) || "there";
    const formattedDate = job.scheduled_date
      ? (() => {
          const d = new Date(job.scheduled_date + "T12:00:00");
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yyyy = d.getFullYear();
          return `${dd}/${mm}/${yyyy}`;
        })()
      : "TBC";
    const timeSlot = job.time_block || "TBC";
    const engineerName = job.assigned_engineer || "TBC";

    // Build message body (360Messenger /v2/sendMessage only supports free text)
    const message =
      `Hi ${firstName}, your booking with ${companyName || "us"} is confirmed.\n\n` +
      `📅 Date: ${formattedDate}\n` +
      `⏰ Time: ${timeSlot}\n` +
      `👷 Engineer: ${engineerName}\n\n` +
      `If you need to make any changes please reply to this message.` +
      (messageFooter ? `\n\n${messageFooter}` : "");

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        customer_id: job.customer_id,
        organisation_id: orgId,
        message_type: "booking_confirmation",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        related_id: service_call_id,
        related_type: "service_call",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    // Send via 360Messenger free-text endpoint (template name retained for reference: ${templateName})
    const cleanNumber = customer.phone.replace(/^\+/, "");
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
      headers: dbHeaders,
      body: JSON.stringify({
        function_name: "send-booking-confirmation",
        error_message: `360Messenger HTTP ${response.status}: ${result.success ? "success" : "failed"}`,
        payload: { api_response: result, sent_to: customer.phone, service_call_id, template_name: templateName, http_status: response.status },
      }),
    });

    // Update message_log status
    if (logId) {
      const updateBody = result.success
        ? { status: "sent" }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };

      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify(updateBody),
      });
    }

    if (!result.success) {
      const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`;

      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          function_name: "send-booking-confirmation",
          error_message: `360Messenger API returned success:false. HTTP ${response.status}`,
          payload: { api_response: result, sent_to: customer.phone, service_call_id },
        }),
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorDetail,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    // Log customer activity on success
    try {
      await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          organisation_id: orgId,
          customer_id: job.customer_id,
          service_call_id: service_call_id,
          event_type: "whatsapp_sent",
          event_label: "WhatsApp sent — Booking Confirmation",
        }),
      });
    } catch {
      /* non-critical */
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
