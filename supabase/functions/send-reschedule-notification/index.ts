import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchWhatsappApiKey } from "../_shared/whatsappCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { service_call_id } = await req.json();
    console.log("send-reschedule-notification received:", { service_call_id });

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

    // Fetch service call
    const scRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${service_call_id}&select=id,customer_id,scheduled_date,time_block,job_type,assigned_engineer,assigned_engineer_id,organisation_id`,
      { headers: dbHeaders },
    );
    const scRows = await scRes.json();
    const job = Array.isArray(scRows) ? scRows[0] : null;

    if (!job) {
      console.log("Service call not found");
      return new Response(JSON.stringify({ success: false, error: "Service call not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    console.log("Job found:", { customer_id: job.customer_id, scheduled_date: job.scheduled_date, time_block: job.time_block });

    const orgId = job.organisation_id;
    if (!orgId) {
      return new Response(JSON.stringify({ success: false, error: "Service call missing organisation_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // WhatsApp api_key via shared resolver (api_key_secret or api_key, either row type)
    const wa = await fetchWhatsappApiKey(supabaseUrl!, supabaseKey!, orgId);
    if (!wa.apiKey) {
      return new Response(JSON.stringify({ success: false, error: `WhatsApp not configured: ${wa.detail}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const apiKey = wa.apiKey;


    // Fetch customer
    const custRes = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${job.customer_id}&select=name,phone`, {
      headers: dbHeaders,
    });
    const custRows = await custRes.json();
    const customer = Array.isArray(custRows) ? custRows[0] : null;
    if (!customer || !customer.phone) {
      console.log("Customer not found or missing phone");
      return new Response(JSON.stringify({ success: false, error: "Customer not found or missing phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    console.log("Customer:", { name: customer.name, phone: customer.phone });

    // Fetch message_footer from settings (by organisation_id)
    let messageFooter = "Karl's Gas Services";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer&limit=1`,
      { headers: dbHeaders },
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]?.message_footer) {
      messageFooter = settings[0].message_footer;
    }

    const firstName = customer.name.split(" ")[0];
    const newDate = job.scheduled_date
      ? new Date(job.scheduled_date + "T12:00:00").toLocaleDateString("en-IE", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "TBC";
    const timeSlot = job.time_block || "TBC";

    const message = `Hi ${firstName}, your appointment has been rescheduled to ${newDate} at ${timeSlot}. Apologies for any inconvenience — ${messageFooter}`;
    console.log("Message:", message);

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        organisation_id: orgId,
        customer_id: job.customer_id,
        message_type: "reschedule_notification",
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
    console.log("Message log created:", logId);

    // Send via 360 Messenger
    const cleanNumber = customer.phone.replace(/^\+/, "");
    console.log("Phone formatted:", cleanNumber);

    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    console.log("360 Messenger response status:", response.status);
    console.log("360 Messenger response body:", resultText);

    let result: any;
    try {
      result = JSON.parse(resultText);
    } catch (_e) {
      result = { success: false, raw: resultText };
    }

    // Log API response
    await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        function_name: "send-reschedule-notification",
        error_message: `360Messenger HTTP ${response.status}: ${result.success ? "success" : "failed"}`,
        payload: { api_response: result, sent_to: customer.phone, service_call_id, http_status: response.status },
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
      console.log("FAILED:", resultText.substring(0, 500));
      return new Response(
        JSON.stringify({ success: false, error: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    // Log customer activity
    try {
      await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          organisation_id: orgId,
          customer_id: job.customer_id,
          service_call_id: service_call_id,
          event_type: "whatsapp_sent",
          event_label: "WhatsApp sent — Reschedule Notification",
        }),
      });
    } catch (_e) {
      /* non-critical */
    }

    // Notify assigned engineer in-app
    try {
      const engineerId = (job as any).assigned_engineer_id;
      if (engineerId && orgId) {
        const engRes = await fetch(
          `${supabaseUrl}/rest/v1/engineers?id=eq.${engineerId}&select=auth_user_id,user_id&limit=1`,
          { headers: dbHeaders },
        );
        const engRows = await engRes.json();
        const recipient = Array.isArray(engRows)
          ? (engRows[0]?.auth_user_id || engRows[0]?.user_id)
          : null;
        if (recipient) {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              recipient_user_id: recipient,
              organisation_id: orgId,
              notification_type: "rescheduled",
              title: "Job Rescheduled",
              body: `${customer.name || "Job"} moved to ${newDate} (${timeSlot})`,
              role: "engineer",
              job_id: service_call_id,
              metadata: { service_call_id, scheduled_date: job.scheduled_date, time_block: job.time_block },
            }),
          });
        }
      }
    } catch (_e) { /* non-critical */ }

    console.log("SUCCESS — reschedule notification sent");
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log("ERROR:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
