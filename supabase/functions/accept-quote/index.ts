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
    const { customer_mobile_number } = await req.json();

    if (!customer_mobile_number || typeof customer_mobile_number !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid customer_mobile_number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const digits = customer_mobile_number.replace(/\D/g, "");

    // Find recent "Sent" quotes joined with customer phone
    const searchRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?status=eq.Sent&order=created_at.desc&limit=20&select=id,total_amount,description,customer_id,quote_number,deposit,deposit_amount,customers!inner(phone,name)`,
      {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
      }
    );

    const quotes = await searchRes.json();

    const match = Array.isArray(quotes)
      ? quotes.find((q: any) => {
          const custPhone = (q.customers?.phone || "").replace(/\D/g, "");
          return custPhone.length >= 9 && digits.length >= 9 &&
            custPhone.slice(-9) === digits.slice(-9);
        })
      : null;

    if (!match) {
      return new Response(
        JSON.stringify({ success: false, error: "No matching Sent quote found for this mobile number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const quoteRef = match.quote_number || `Q-${match.id.slice(0, 4).toUpperCase()}`;

    // Use respond_to_quote RPC — handles job creation, status update, notifications, audit log
    const rpcRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/respond_to_quote`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_quote_id: match.id, p_accepted: true }),
      }
    );

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return new Response(
        JSON.stringify({ success: false, error: "Failed to accept quote: " + errText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Get the converted job id
    const updatedQuoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${match.id}&select=converted_job_id,user_id`,
      {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
      }
    );
    const updatedQuotes = await updatedQuoteRes.json();
    const updatedQuote = Array.isArray(updatedQuotes) ? updatedQuotes[0] : null;
    const newJobId = updatedQuote?.converted_job_id || null;

    // Send WhatsApp office alert
    const customerName = match.customers?.name || "Customer";
    const totalAmount = Number(match.total_amount || 0).toFixed(2);
    const depositAmount = Number(match.deposit || match.deposit_amount || 0).toFixed(2);

    try {
      // Get office WhatsApp number from settings
      const settingsRes = await fetch(
        `${supabaseUrl}/rest/v1/settings?user_id=eq.${updatedQuote?.user_id}&select=whatsapp_number,business_phone&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            "Content-Type": "application/json",
          },
        }
      );
      const settingsData = await settingsRes.json();
      const officeNumber = Array.isArray(settingsData) ? (settingsData[0]?.whatsapp_number || settingsData[0]?.business_phone) : null;

      if (officeNumber) {
        const apiKey = Deno.env.get("MESSENGER_API_KEY");
        if (apiKey) {
          const alertMsg = `✅ Quote Accepted

Customer: ${customerName}
Quote: ${quoteRef}
Total: €${totalAmount}
Deposit: €${depositAmount}

Job has been created — open BookedJobs to schedule.`;

          const cleanNumber = officeNumber.replace(/^\+/, "");
          const formData = new FormData();
          formData.append("phonenumber", cleanNumber);
          formData.append("text", alertMsg);

          await fetch("https://api.360messenger.com/v2/sendMessage", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}` },
            body: formData,
          });
        }
      }
    } catch (_) {
      // WhatsApp alert is best-effort, don't fail the acceptance
    }

    return new Response(
      JSON.stringify({ success: true, quote_ref: quoteRef, quote_id: match.id, job_id: newJobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
