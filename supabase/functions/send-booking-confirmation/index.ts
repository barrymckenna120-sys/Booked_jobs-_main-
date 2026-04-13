import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const apiKey = Deno.env.get("THREESIXTY_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey!,
      "Content-Type": "application/json",
    };

    // Fetch the service call with customer details
    const scRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${service_call_id}&select=id,customer_id,scheduled_date,time_block,job_type,assigned_engineer,user_id`,
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

    // Fetch customer details
    const custRes = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${job.customer_id}&select=name,phone`, {
      headers: dbHeaders,
    });
    const custRows = await custRes.json();
    const customer = Array.isArray(custRows) ? custRows[0] : null;
    if (!customer || !customer.phone) {
      return new Response(JSON.stringify({ success: false, error: "Customer not found or missing phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch message_footer from settings
    let messageFooter = "K&N Gas Services";
    if (job.user_id) {
      const settingsRes = await fetch(
        `${supabaseUrl}/rest/v1/settings?user_id=eq.${job.user_id}&select=message_footer&limit=1`,
        { headers: dbHeaders },
      );
      const settings = await settingsRes.json();
      if (Array.isArray(settings) && settings[0]?.message_footer) {
        messageFooter = settings[0].message_footer;
      }
    }

    const firstName = customer.name.split(" ")[0];
    const scheduledDate = job.scheduled_date
      ? new Date(job.scheduled_date + "T12:00:00").toLocaleDateString("en-IE", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "TBC";
    const timeSlot = job.time_block || "TBC";
    const jobType = job.job_type || "service";
    const engineerName = job.assigned_engineer || "our engineer";

    const message = `Booking Confirmed ✅
${messageFooter}

Hi ${firstName}, your ${jobType} has been booked for ${scheduledDate} between ${timeSlot}.

Your engineer ${engineerName} will be with you on the day. If you need to make any changes, give us a call.

Thanks,
${messageFooter}`;

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        customer_id: job.customer_id,
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

    // Send via 360Messenger
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
      const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`;

      // Log to edge_function_logs
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
      const orgRes = await fetch(
        `${supabaseUrl}/rest/v1/service_calls?id=eq.${service_call_id}&select=organisation_id`,
        { headers: dbHeaders },
      );
      const orgRows = await orgRes.json();
      const orgId = (Array.isArray(orgRows) && orgRows[0]?.organisation_id) || "8c37827f-ce2c-4507-a821-a5e807d89856";
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
