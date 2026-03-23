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
    const {
      quote_id,
      customer_name,
      mobile_number,
      job_description,
      quote_amount,
      parts_cost,
      labour_cost,
      deposit_amount,
      business_phone,
      business_name,
      pdf_url,
      quote_number,
    } = await req.json();

    if (!quote_id || !customer_name || !mobile_number || quote_amount == null) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const apiKey = Deno.env.get("MESSENGER_API_KEY");
    const firstName = customer_name.split(" ")[0];
    const refNumber = quote_number || `Q-${quote_id.substring(0, 4).toUpperCase()}`;
    const companyName = business_name || "Karl's Gas";
    const deposit = Number(deposit_amount || 0);

    const acceptUrl = `https://bookedjobs.ie/quote/${quote_id}`;

    let message = `Hi ${firstName},

Here is your quote for ${job_description}.

Quote No: ${refNumber}

Total: €${Number(quote_amount).toFixed(2)}`;

    if (deposit > 0) {
      message += `\n\nDeposit to secure booking: €${deposit.toFixed(2)}`;
    }

    message += `

To accept this quote, reply:
YES ${refNumber}

View and approve here:
${acceptUrl}`;

    if (pdf_url) {
      message += `\n\n📄 View your full quote PDF:\n${pdf_url}`;
    }

    message += `\n\n${companyName}`;

    if (business_phone) {
      message += `\n📞 ${business_phone}`;
    }

    const cleanNumber = mobile_number.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: any;
    try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (result.success) {
      await fetch(`${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Sent", sent_at: new Date().toISOString() }),
      });
    } else {
      // Log the full API response to edge_function_logs
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          function_name: "send-quote-whatsapp",
          error_message: `360Messenger API returned success:false. HTTP ${response.status}`,
          payload: { api_response: result, sent_to: mobile_number, quote_id },
        }),
      });
    }

    return new Response(JSON.stringify({ success: result.success }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
