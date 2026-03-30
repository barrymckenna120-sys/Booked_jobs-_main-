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
    const { job_id, customer_name, customer_phone, follow_up_detail, message: customMessage } = await req.json();

    if (!job_id || !customer_name || !customer_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("THREESIXTY_API_KEY");

    const headers = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Fetch job to get user_id for settings lookup
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${job_id}&select=user_id`,
      { headers }
    );
    const jobs = await jobRes.json();
    const userId = Array.isArray(jobs) ? jobs[0]?.user_id : null;

    // Fetch message_footer from settings
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

    const firstName = customer_name.split(" ")[0];
    const baseMessage = customMessage || `Hi ${firstName}, great news! The part we ordered for your boiler has arrived. 🔧\n\nWe'd like to arrange a time to come back and complete the work.\n\nDetails: ${follow_up_detail || "Follow-up repair"}\n\nPlease reply to this message or call us to book a time that suits you.`;
    const message = `${baseMessage}\n\n${messageFooter}`;

    // Log to message_log
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
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

    if (!apiKey) {
      if (logId) {
        await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "failed", error_message: "MESSENGER_API_KEY not configured" }),
        });
      }
      return new Response(
        JSON.stringify({ success: true, note: "Message logged but WhatsApp API key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
