import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalisePhone } from "../_shared/whatsapp.ts";
import { sendDepositLink } from "../_shared/depositLink.ts";

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
  const serviceCallId = quote.converted_job_id;
  if (!serviceCallId) {
    console.log("No converted_job_id — skipping deposit WhatsApp");
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

  await sendDepositLink({
    supabaseUrl,
    headers,
    service_call_id: serviceCallId,
    deposit_amount: Number(quote.deposit || quote.deposit_amount || 0),
    customer_id: quote.customer_id || null,
    organisation_id: orgId,
    customerName,
    customerPhone: quote.customers?.phone ?? null,
    customerOptedOut: quote.customers?.opted_out === true,
  });
}
