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
      business_phone,
    } = await req.json();

    if (!quote_id || !customer_name || !mobile_number || !job_description || quote_amount == null) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: quote_id, customer_name, mobile_number, job_description, quote_amount" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const apiKey = Deno.env.get("MESSENGER_API_KEY");
    const firstName = customer_name.split(" ")[0];
    const refNumber = `Q-${quote_id.substring(0, 4).toUpperCase()}`;

    // Build breakdown lines — only show parts/labour if > 0
    const breakdownLines: string[] = [];
    if (parts_cost && Number(parts_cost) > 0) {
      breakdownLines.push(`• Parts: €${Number(parts_cost).toFixed(2)}`);
    }
    if (labour_cost && Number(labour_cost) > 0) {
      breakdownLines.push(`• Labour: €${Number(labour_cost).toFixed(2)}`);
    }
    breakdownLines.push(`• Total: €${Number(quote_amount).toFixed(2)}`);

    const breakdownBlock = breakdownLines.join("\n");

    let message = `Hi ${firstName},

Here is your quote from Karl's Gas.

Quote Ref: ${refNumber}

Job: ${job_description}

Breakdown:
${breakdownBlock}

To accept this quote, simply reply *YES* to this message.

This quote is valid for 14 days from today.

Karl's Gas`;

    if (business_phone) {
      message += `\n📞 ${business_phone}`;
    }

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
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      await fetch(`${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey!,
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
