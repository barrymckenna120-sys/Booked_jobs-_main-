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
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // ── MODE 1: Direct quote approval by ID (from public quote page) ──
    if (body.quote_id) {
      const quoteId = body.quote_id;
      console.log("accept-quote called with quote_id:", quoteId);

      // Call respond_to_quote RPC with service role (bypasses RLS)
      const rpcRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/respond_to_quote`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ p_quote_id: quoteId, p_accepted: true }),
        }
      );

      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        console.error("respond_to_quote failed:", errText);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to accept quote" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
      await rpcRes.text(); // consume body

      console.log("respond_to_quote succeeded for:", quoteId);

      // Get updated quote info for WhatsApp alert
      const updatedRes = await fetch(
        `${supabaseUrl}/rest/v1/quotes?id=eq.${quoteId}&select=converted_job_id,user_id,quote_number,total_amount,deposit,deposit_amount,customer_id,customers(name)`,
        { headers }
      );
      const updatedQuotes = await updatedRes.json();
      const updatedQuote = Array.isArray(updatedQuotes) ? updatedQuotes[0] : null;

      if (updatedQuote) {
        const quoteRef = updatedQuote.quote_number || `Q-${quoteId.slice(0, 4).toUpperCase()}`;
        const customerName = updatedQuote.customers?.name || "Customer";
        const totalAmount = Number(updatedQuote.total_amount || 0).toFixed(2);
        const depositAmount = Number(updatedQuote.deposit || updatedQuote.deposit_amount || 0).toFixed(2);

        // Send WhatsApp office alert (best-effort)
        await sendWhatsAppAlert(supabaseUrl, headers, updatedQuote.user_id, customerName, quoteRef, totalAmount, depositAmount);

        return new Response(
          JSON.stringify({ success: true, quote_ref: quoteRef, quote_id: quoteId, job_id: updatedQuote.converted_job_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── MODE 2: WhatsApp auto-reply acceptance by phone number ──
    const { customer_mobile_number } = body;

    if (!customer_mobile_number || typeof customer_mobile_number !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing quote_id or customer_mobile_number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const digits = customer_mobile_number.replace(/\D/g, "");

    const searchRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?status=eq.Sent&order=created_at.desc&limit=20&select=id,total_amount,description,customer_id,quote_number,deposit,deposit_amount,customers!inner(phone,name)`,
      { headers }
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

    const rpcRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/respond_to_quote`,
      {
        method: "POST",
        headers,
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
    await rpcRes.text();

    const updatedQuoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${match.id}&select=converted_job_id,user_id`,
      { headers }
    );
    const updatedQuotes2 = await updatedQuoteRes.json();
    const updatedQuote2 = Array.isArray(updatedQuotes2) ? updatedQuotes2[0] : null;

    const customerName = match.customers?.name || "Customer";
    const totalAmount = Number(match.total_amount || 0).toFixed(2);
    const depositAmount = Number(match.deposit || match.deposit_amount || 0).toFixed(2);

    await sendWhatsAppAlert(supabaseUrl, headers, updatedQuote2?.user_id, customerName, quoteRef, totalAmount, depositAmount);

    return new Response(
      JSON.stringify({ success: true, quote_ref: quoteRef, quote_id: match.id, job_id: updatedQuote2?.converted_job_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("accept-quote error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function sendWhatsAppAlert(
  supabaseUrl: string,
  headers: Record<string, string>,
  userId: string | null,
  customerName: string,
  quoteRef: string,
  totalAmount: string,
  depositAmount: string
) {
  if (!userId) return;
  try {
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?user_id=eq.${userId}&select=whatsapp_number,business_phone&limit=1`,
      { headers }
    );
    const settingsData = await settingsRes.json();
    const officeNumber = Array.isArray(settingsData) ? (settingsData[0]?.whatsapp_number || settingsData[0]?.business_phone) : null;

    if (officeNumber) {
      const apiKey = Deno.env.get("MESSENGER_API_KEY");
      if (apiKey) {
        const alertMsg = `✅ Quote Accepted\n\nCustomer: ${customerName}\nQuote: ${quoteRef}\nTotal: €${totalAmount}\nDeposit: €${depositAmount}\n\nJob has been created — open BookedJobs to schedule.`;

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
  } catch (e) {
    console.error("WhatsApp alert failed:", e);
  }
}
