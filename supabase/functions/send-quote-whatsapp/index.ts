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
    const { quote_id, customer_name, mobile_number, job_description, quote_amount } = await req.json();

    const apiKey = Deno.env.get("MESSENGER_API_KEY");

    const message = `Hi ${customer_name},\n\nHere is your quote from Karl's Gas.\n\nJob: ${job_description}\nTotal: €${quote_amount}\n\nKarl's Gas`;

    const formData = new FormData();
    formData.append("phonenumber", mobile_number);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      // Update quote status to sent
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      await fetch(`${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "sent" }),
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