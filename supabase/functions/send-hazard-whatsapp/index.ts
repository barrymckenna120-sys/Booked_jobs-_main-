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
    const { hazard_id } = await req.json();
    if (!hazard_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing hazard_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("THREESIXTY_API_KEY");

    const headers = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Fetch hazard notification
    const hazardRes = await fetch(
      `${supabaseUrl}/rest/v1/hazard_notifications?id=eq.${hazard_id}&select=id,ref_number,pdf_url,customer_id,job_id`,
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

    // Fetch customer
    const custRes = await fetch(
      `${supabaseUrl}/rest/v1/customers?id=eq.${hazard.customer_id}&select=name,phone`,
      { headers }
    );
    const custs = await custRes.json();
    const customer = Array.isArray(custs) ? custs[0] : null;
    if (!customer || !customer.phone) {
      return new Response(JSON.stringify({ success: false, error: "Customer or phone not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    // Fetch job to get user_id + engineer
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${hazard.job_id}&select=user_id,assigned_engineer_id`,
      { headers }
    );
    const jobs = await jobRes.json();
    const job = Array.isArray(jobs) ? jobs[0] : null;
    const userId = job?.user_id;

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

    // Fetch settings for message_footer
    let messageFooter = "K&N Gas Services";
    if (userId) {
      const settingsRes = await fetch(
        `${supabaseUrl}/rest/v1/settings?user_id=eq.${userId}&select=message_footer&limit=1`,
        { headers }
      );
      const settings = await settingsRes.json();
      if (Array.isArray(settings) && settings[0]?.message_footer) {
        messageFooter = settings[0].message_footer;
      }
    }

    const firstName = customer.name.split(" ")[0];
    const pdfLink = hazard.ref_number
      ? `https://ktkfuquqxbrmuqrmbmdj.supabase.co/storage/v1/object/public/certificates/${encodeURIComponent(hazard.ref_number)}.pdf`
      : hazard.pdf_url;

    const message = `Hi ${firstName}, please find attached your Gas Installation Notification of Hazard/Non-Conformance from ${engineerName}.\n\n📄 View Document:\n${pdfLink}\n\n${messageFooter}`;

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
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

    if (!apiKey) {
      if (logId) {
        await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
          method: "PATCH", headers,
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
    formData.append("doc_url", hazard.pdf_url);

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
        const orgRes = await fetch(`${supabaseUrl}/rest/v1/service_calls?id=eq.${hazard.job_id}&select=organisation_id`, { headers });
        const orgRows = await orgRes.json();
        const orgId = (Array.isArray(orgRows) && orgRows[0]?.organisation_id) || "8c37827f-ce2c-4507-a821-a5e807d89856";
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
