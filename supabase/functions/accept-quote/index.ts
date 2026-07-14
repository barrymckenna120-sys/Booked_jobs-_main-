import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getWhatsAppConfig, normalisePhone } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
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
        `${supabaseUrl}/rest/v1/quotes?id=eq.${quoteId}&select=converted_job_id,user_id,quote_number,total_amount,deposit,deposit_amount,customer_id,payment_link,customers(name,phone,opted_out)`,
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

        // Send deposit payment request to customer (fire-and-forget)
        sendDepositPaymentWhatsApp(
          supabaseUrl, headers, updatedQuote, customerName
        ).catch((e) => console.error("Deposit WhatsApp send failed:", e));

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
      `${supabaseUrl}/rest/v1/quotes?status=eq.Sent&order=created_at.desc&limit=20&select=id,total_amount,description,customer_id,quote_number,deposit,deposit_amount,payment_link,customers!inner(phone,name,opted_out)`,
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
      `${supabaseUrl}/rest/v1/quotes?id=eq.${match.id}&select=converted_job_id,user_id,deposit,deposit_amount,payment_link`,
      { headers }
    );
    const updatedQuotes2 = await updatedQuoteRes.json();
    const updatedQuote2 = Array.isArray(updatedQuotes2) ? updatedQuotes2[0] : null;

    const customerName = match.customers?.name || "Customer";
    const totalAmount = Number(match.total_amount || 0).toFixed(2);
    const depositAmount = Number(match.deposit || match.deposit_amount || 0).toFixed(2);

    await sendWhatsAppAlert(supabaseUrl, headers, updatedQuote2?.user_id, customerName, quoteRef, totalAmount, depositAmount);

    // Send deposit payment request to customer (fire-and-forget)
    const mergedQuoteData = {
      ...match,
      converted_job_id: updatedQuote2?.converted_job_id,
      user_id: updatedQuote2?.user_id,
      payment_link: updatedQuote2?.payment_link || match.payment_link,
      deposit: updatedQuote2?.deposit || match.deposit,
      deposit_amount: updatedQuote2?.deposit_amount || match.deposit_amount,
    };
    sendDepositPaymentWhatsApp(
      supabaseUrl, headers, mergedQuoteData, customerName
    ).catch((e) => console.error("Deposit WhatsApp send failed (mode 2):", e));

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
      `${supabaseUrl}/rest/v1/settings?user_id=eq.${userId}&select=whatsapp_number,business_phone,organisation_id&limit=1`,
      { headers }
    );
    const settingsData = await settingsRes.json();
    const settingsRow = Array.isArray(settingsData) ? settingsData[0] : null;
    const officeNumber = settingsRow?.whatsapp_number || settingsRow?.business_phone;
    const alertOrgId = settingsRow?.organisation_id;

    if (officeNumber && alertOrgId) {
      try {
        const supabaseUrlEnv = Deno.env.get("SUPABASE_URL")!;
        const supabaseKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrlEnv, supabaseKeyEnv);
        const { apiKey } = await getWhatsAppConfig(sb, alertOrgId);

        const alertMsg = `✅ Quote Accepted\n\nCustomer: ${customerName}\nQuote: ${quoteRef}\nTotal: €${totalAmount}\nDeposit: €${depositAmount}\n\nJob has been created — open BookedJobs to schedule.`;

        const cleanNumber = normalisePhone(officeNumber);
        const formData = new FormData();
        formData.append("phonenumber", cleanNumber);
        formData.append("text", alertMsg);

        await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}` },
          body: formData,
        });
      } catch (e) {
        console.error("Office WhatsApp alert failed:", (e as Error).message);
      }
    }
  } catch (e) {
    console.error("WhatsApp alert failed:", e);
  }
}

async function sendDepositPaymentWhatsApp(
  supabaseUrl: string,
  headers: Record<string, string>,
  quote: any,
  customerName: string
) {
  try {
    console.log("sendDepositPaymentWhatsApp called:", JSON.stringify({
      depositAmount: quote.deposit || quote.deposit_amount,
      convertedJobId: quote.converted_job_id,
      customerPhone: quote.customers?.phone,
      customerOptedOut: quote.customers?.opted_out,
      paymentLinkOnQuote: quote.payment_link,
    }));
    const depositAmount = Number(quote.deposit || quote.deposit_amount || 0);
    if (depositAmount <= 0) {
      console.log("No deposit amount — skipping deposit WhatsApp");
      return;
    }

    const serviceCallId = quote.converted_job_id;
    if (!serviceCallId) {
      console.log("No converted_job_id — skipping deposit WhatsApp");
      return;
    }

    // Check customer opted_out
    const customerOptedOut = quote.customers?.opted_out === true;
    if (customerOptedOut) {
      console.log("Customer opted out — skipping deposit WhatsApp");
      return;
    }

    const customerPhone = quote.customers?.phone;
    if (!customerPhone) {
      console.log("No customer phone — skipping deposit WhatsApp");
      return;
    }

    // Generate Stripe Payment Link dynamically
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.log("No STRIPE_SECRET_KEY — skipping deposit WhatsApp");
      return;
    }

    const amountCents = Math.round(depositAmount * 100);

    // Step 1: Create a Stripe Price
    const priceRes = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "unit_amount": amountCents.toString(),
        "currency": "eur",
        "product_data[name]": "Deposit - Job Booking",
      }),
    });
    const priceData = await priceRes.json();
    if (!priceData.id) {
      console.error("Stripe price creation failed:", JSON.stringify(priceData));
      return;
    }

    // Step 2: Create a Stripe Payment Link
    const linkRes = await fetch("https://api.stripe.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "line_items[0][price]": priceData.id,
        "line_items[0][quantity]": "1",
        "metadata[job_id]": serviceCallId,
        "metadata[service_call_id]": serviceCallId,
        "metadata[customer_id]": quote.customer_id || "",
      }),
    });
    const linkData = await linkRes.json();
    if (!linkData.url) {
      console.error("Stripe payment link creation failed:", JSON.stringify(linkData));
      return;
    }

    const paymentLink = linkData.url;
    console.log("Stripe payment link generated:", paymentLink);

    // Save payment link back to service_calls
    await fetch(`${supabaseUrl}/rest/v1/service_calls?id=eq.${serviceCallId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ payment_link: paymentLink }),
    });

    const apiKey = Deno.env.get("THREESIXTY_API_KEY");
    if (!apiKey) {
      console.log("No WhatsApp API key — skipping deposit WhatsApp");
      return;
    }

    // Resolve organisation + branding from service_call
    const jobOrgRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${serviceCallId}&select=organisation_id&limit=1`,
      { headers }
    );
    const jobOrgRows = await jobOrgRes.json();
    const orgId = Array.isArray(jobOrgRows) ? jobOrgRows[0]?.organisation_id : null;

    let companyName = "K & N Gas Services";
    let companyPhone = "087 3686252";
    if (orgId) {
      const tiRes = await fetch(
        `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
        { headers }
      );
      const tiRows = await tiRes.json();
      const cfg = Array.isArray(tiRows) ? tiRows[0]?.config : null;
      if (cfg?.company_name) companyName = cfg.company_name;
      if (cfg?.company_phone) companyPhone = cfg.company_phone;
    }

    const message = `Hi ${customerName},\n\nThank you for approving your quote with ${companyName}.\n\nTo confirm your booking and secure the parts for your job, a 50% deposit of €${depositAmount.toFixed(2)} is required.\n\nPay securely here: ${paymentLink}\n\nIf you have any questions please reply to this message.\n\n${companyName} ☎ ${companyPhone}`;

    const cleanNumber = customerPhone.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    // Log pending to message_log
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        customer_id: quote.customer_id || null,
        message_type: "payment_link",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        related_id: serviceCallId,
        related_type: "service_call",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    const res = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await res.text();
    let result: any;
    try { result = JSON.parse(resultText); } catch (_e) { result = { success: false, raw: resultText }; }

    // Update message_log status
    if (logId) {
      const updateBody = result.success
        ? { status: "sent" }
        : { status: "failed", error_message: `360Messenger HTTP ${res.status}: ${resultText.substring(0, 500)}` };

      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(updateBody),
      });
    }

    // Log to edge_function_logs if failed
    if (!result.success) {
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          function_name: "accept-quote",
          error_message: `Deposit WhatsApp failed. HTTP ${res.status}: ${resultText.substring(0, 300)}`,
          payload: { sent_to: cleanNumber, service_call_id: serviceCallId, customer_id: quote.customer_id },
        }),
      });
    }

    // Log customer activity on success
    if (result.success && quote.customer_id) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
          method: "POST", headers,
          body: JSON.stringify({
            organisation_id: orgId,
            customer_id: quote.customer_id,
            service_call_id: serviceCallId,
            event_type: "whatsapp_sent",
            event_label: "WhatsApp sent — Deposit Payment Request",
          }),
        });
      } catch { /* non-critical */ }
    }

    console.log("Deposit WhatsApp send result:", result.success ? "sent" : "failed");
  } catch (e) {
    console.error("sendDepositPaymentWhatsApp error:", e);
  }
}
