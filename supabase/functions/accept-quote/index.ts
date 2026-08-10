import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getWhatsAppConfig, normalisePhone, logWhatsAppFailure } from "../_shared/whatsapp.ts";
import { buildSumUpReturnUrl, createSumUpDepositCheckout } from "../_shared/sumupCheckout.ts";
import { resolveSumUpCredentials, makeRestSumUpConfigLoader } from "../_shared/sumupCredentials.ts";

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

    // ── MODE 1: Direct quote approval by ID + access_token ──
    // Token supplied by caller (public quote page URL param, or staff extra-work
    // card reading it from their RLS-scoped quote row). Never fetched here.
    if (body.quote_id) {
      const quoteId = body.quote_id;
      const accessToken = body.access_token;

      if (!accessToken || typeof accessToken !== "string") {
        console.error("accept-quote: missing access_token for quote_id:", quoteId);
        return new Response(
          JSON.stringify({ success: false, error: "missing_quote_id_or_access_token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      console.log("accept-quote called with quote_id:", quoteId);

      // Token check is enforced inside respond_to_quote against quotes.access_token.
      const rpcRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/respond_to_quote`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_quote_id: quoteId,
            p_accepted: true,
            p_access_token: accessToken,
          }),
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
      const rpcBody = await rpcRes.text();

      // RPC returns jsonb with success flag — surface token/status rejections.
      try {
        const parsed = JSON.parse(rpcBody);
        if (parsed && parsed.success === false) {
          console.error("respond_to_quote rejected:", parsed.error);
          return new Response(
            JSON.stringify({ success: false, error: parsed.error || "rejected" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      } catch { /* non-json response, treat as success */ }

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

        await sendWhatsAppAlert(supabaseUrl, headers, updatedQuote.user_id, customerName, quoteRef, totalAmount, depositAmount);

        // Deposit link + WhatsApp runs in the background, but must survive the
        // response — otherwise the isolate shuts down mid-Stripe call.
        const depositTask = sendDepositPaymentWhatsApp(
          supabaseUrl, headers, updatedQuote, customerName
        )
          .then(() => console.log("Deposit WhatsApp task finished for quote:", quoteId))
          .catch((e) => console.error("Deposit WhatsApp send failed:", e));

        const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
        if (typeof waitUntil === "function") {
          waitUntil.call((globalThis as any).EdgeRuntime, depositTask);
        } else {
          await depositTask;
        }


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

    // Legacy phone-number fallback removed — no callers exist.
    return new Response(
      JSON.stringify({ success: false, error: "Missing quote_id or access_token" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
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
        const msg = (e as Error).message;
        console.error("Office WhatsApp alert failed:", msg);
        try {
          const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          await logWhatsAppFailure(sb, {
            organisation_id: alertOrgId,
            customer_id: null,
            message_type: "quote",
            content: `Office alert — Quote ${quoteRef} accepted (${customerName})`,
            sent_by: userId,
            error_message: msg,
          });
        } catch { /* non-critical */ }
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

    // Resolve organisation FIRST — SumUp credentials are per-tenant and a
    // customer's deposit must never route into another tenant's account.
    const jobOrgRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${serviceCallId}&select=organisation_id&limit=1`,
      { headers }
    );
    const jobOrgRows = await jobOrgRes.json();
    const orgId = Array.isArray(jobOrgRows) ? jobOrgRows[0]?.organisation_id : null;

    if (!orgId) {
      console.log("No organisation_id on service_call — skipping deposit WhatsApp");
      return;
    }

    // Per-org SumUp credentials. No global fallback by design.
    const credsResult = await resolveSumUpCredentials({
      organisationId: orgId,
      loadConfig: makeRestSumUpConfigLoader(supabaseUrl, headers),
    });

    if (!credsResult.ok || !credsResult.credentials) {
      console.error(
        "SumUp credentials unavailable for organisation — skipping deposit link",
        { organisation_id: orgId, reason: credsResult.error }
      );
      return;
    }

    // Per-checkout webhook subscription: SumUp has no account-level webhook
    // setting, so the confirmation URL must ride on every checkout we create.
    const returnUrl = buildSumUpReturnUrl(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUMUP_WEBHOOK_SECRET"),
    );
    if (!returnUrl) {
      console.error(
        "SUMUP_WEBHOOK_SECRET missing — creating checkout WITHOUT a confirmation webhook; payment will not auto-confirm",
      );
    }

    const checkout = await createSumUpDepositCheckout({
      amount: depositAmount,
      serviceCallId,
      apiKey: credsResult.credentials.apiKey,
      merchantCode: credsResult.credentials.merchantCode,
      returnUrl: returnUrl ?? undefined,
    });

    if (!checkout.ok || !checkout.url) {
      console.error("SumUp checkout creation failed:", checkout.error);
      return;
    }

    const paymentLink = checkout.url;
    console.log("SumUp hosted checkout generated for org:", orgId);

    // Save payment link (+ checkout id) back to service_calls
    await fetch(`${supabaseUrl}/rest/v1/service_calls?id=eq.${serviceCallId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        payment_link: paymentLink,
        ...(checkout.checkoutId ? { sumup_checkout_id: checkout.checkoutId } : {}),
      }),
    });

    let companyName = "K & N Gas Services";
    let companyPhone = "087 3686252";
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      { headers }
    );
    const tiRows = await tiRes.json();
    const cfg = Array.isArray(tiRows) ? tiRows[0]?.config : null;
    if (cfg?.company_name) companyName = cfg.company_name;
    if (cfg?.company_phone) companyPhone = cfg.company_phone;


    // Resolve tenant-scoped 360Messenger API key
    let apiKey: string;
    try {
      const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const wa = await getWhatsAppConfig(sb, orgId);
      apiKey = wa.apiKey;
    } catch (e) {
      const msg = (e as Error).message;
      console.error("Deposit WhatsApp: no tenant-scoped API key:", msg);
      try {
        const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await logWhatsAppFailure(sb, {
          organisation_id: orgId,
          customer_id: quote.customer_id || null,
          message_type: "payment_link",
          content: `Deposit payment link for job ${serviceCallId} — config unavailable`,
          related_id: serviceCallId,
          related_type: "service_call",
          sent_by: "system",
          error_message: msg,
        });
      } catch { /* non-critical */ }
      return;
    }

    const message = `Hi ${customerName},\n\nThank you for approving your quote with ${companyName}.\n\nTo confirm your booking and secure the parts for your job, a 50% deposit of €${depositAmount.toFixed(2)} is required.\n\nPay securely here: ${paymentLink}\n\nIf you have any questions please reply to this message.\n\n${companyName} ☎ ${companyPhone}`;

    const cleanNumber = normalisePhone(customerPhone);
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    // Log pending to message_log
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        organisation_id: orgId,
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
