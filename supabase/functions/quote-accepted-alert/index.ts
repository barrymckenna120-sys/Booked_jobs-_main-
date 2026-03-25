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
    const { quote_id } = await req.json();
    if (!quote_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing quote_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Get quote + customer + settings
    const quoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&select=quote_number,total_amount,deposit,deposit_amount,user_id,customer_id,customers!inner(name)`,
      { headers: dbHeaders }
    );
    const quotes = await quoteRes.json();
    const quote = Array.isArray(quotes) ? quotes[0] : null;
    if (!quote) {
      return new Response(JSON.stringify({ success: false, error: "Quote not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    // Fetch settings: whatsapp_number, business_phone, message_footer
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?user_id=eq.${quote.user_id}&select=whatsapp_number,business_phone,message_footer&limit=1`,
      { headers: dbHeaders }
    );
    const settings = await settingsRes.json();
    const officeNumber = Array.isArray(settings) ? (settings[0]?.whatsapp_number || settings[0]?.business_phone) : null;
    const messageFooter = (Array.isArray(settings) && settings[0]?.message_footer) ? settings[0].message_footer : "K&N Gas Services";

    if (!officeNumber) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: "No office number configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("MESSENGER_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: "No WhatsApp API key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerName = quote.customers?.name || "Customer";
    const quoteRef = quote.quote_number || `Q-${quote_id.slice(0, 4).toUpperCase()}`;
    const totalAmount = Number(quote.total_amount || 0).toFixed(2);
    const depositAmount = Number(quote.deposit || quote.deposit_amount || 0).toFixed(2);

    const alertMsg = `✅ Quote Accepted

Customer: ${customerName}
Quote: ${quoteRef}
Total: €${totalAmount}
Deposit: €${depositAmount}

Job has been created — open BookedJobs to schedule.

${messageFooter}`;

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, "Prefer": "return=representation" },
      body: JSON.stringify({
        customer_id: quote.customer_id || null,
        message_type: "quote",
        channel: "whatsapp",
        direction: "outbound",
        content: alertMsg,
        status: "pending",
        related_id: quote_id,
        related_type: "quote",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    const cleanNumber = officeNumber.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", alertMsg);

    const res = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await res.text();
    let result: any;
    try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }

    // Update message_log status
    if (logId) {
      const updateBody = result.success
        ? { status: "sent" }
        : { status: "failed", error_message: `360Messenger HTTP ${res.status}: ${resultText.substring(0, 500)}` };

      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify(updateBody),
      });
    }

    return new Response(JSON.stringify({ success: true, sent: result.success }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
