/**
 * Deposit payment link + WhatsApp send.
 *
 * Extracted (behaviour-for-behaviour) from accept-quote's private
 * sendDepositPaymentWhatsApp so job creation can use the exact same money path.
 *
 * Money path rules kept intact:
 *  - Per-organisation SumUp credentials only. No global fallback, ever.
 *  - Per-checkout webhook return URL (SumUp has no account-level webhook).
 *  - payment_link + sumup_checkout_id written back to the job.
 *  - Tenant-scoped 360Messenger key.
 *  - message_log row goes pending -> sent/failed.
 *  - customer_activity entry only on a successful send.
 *
 * organisation_id is ALWAYS supplied by the caller — this module never resolves
 * a tenant for itself, so it cannot be steered into cross-tenant routing.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { normalisePhone, logWhatsAppFailure } from "./whatsapp.ts";
import { fetchWhatsappApiKeyWithClient } from "./whatsappCredentials.ts";
import { buildSumUpReturnUrl, createSumUpDepositCheckout } from "./sumupCheckout.ts";
import { resolveSumUpCredentials, makeRestSumUpConfigLoader } from "./sumupCredentials.ts";

export interface SendDepositLinkArgs {
  supabaseUrl: string;
  /** Service-role PostgREST headers assembled by the caller. */
  headers: Record<string, string>;
  service_call_id: string | null | undefined;
  deposit_amount: number | null | undefined;
  customer_id: string | null | undefined;
  organisation_id: string | null | undefined;
  /** Optional — falls back to the customer row, then "Customer". */
  customerName?: string | null;
  /** Optional pre-read customer fields (accept-quote already has them). */
  customerPhone?: string | null;
  customerOptedOut?: boolean | null;
}

export interface SendDepositLinkResult {
  ok: boolean;
  /** Set when a guard stopped us before any SumUp/WhatsApp call. */
  skipped?: string;
  sent?: boolean;
  paymentLink?: string;
  /** True when an existing PENDING checkout was reused instead of created. */
  reused?: boolean;
  error?: string;
}

export async function sendDepositLink(
  args: SendDepositLinkArgs,
): Promise<SendDepositLinkResult> {
  const { supabaseUrl, headers } = args;
  const serviceCallId = args.service_call_id;
  const orgId = args.organisation_id;
  const customerId = args.customer_id ?? null;
  const depositAmount = Number(args.deposit_amount || 0);

  try {
    console.log("sendDepositLink called:", JSON.stringify({
      service_call_id: serviceCallId,
      deposit_amount: depositAmount,
      organisation_id: orgId,
      customer_id: customerId,
    }));

    if (!(depositAmount > 0)) {
      console.log("No deposit amount — skipping deposit WhatsApp");
      return { ok: true, skipped: "no_deposit_amount" };
    }
    if (!serviceCallId) {
      console.log("No service_call_id — skipping deposit WhatsApp");
      return { ok: true, skipped: "no_service_call" };
    }
    if (!orgId) {
      console.log("No organisation_id — skipping deposit WhatsApp");
      return { ok: true, skipped: "no_organisation" };
    }

    // Customer name / phone / opt-out — use pre-read values when supplied.
    let customerName = (args.customerName || "").trim();
    let customerPhone: string | null = args.customerPhone ?? null;
    let customerOptedOut = args.customerOptedOut === true;

    if (customerId && (!customerPhone || !customerName)) {
      const custRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${customerId}&select=name,phone,opted_out&limit=1`,
        { headers },
      );
      const custRows = await custRes.json();
      const customer = Array.isArray(custRows) ? custRows[0] : null;
      if (customer) {
        if (!customerName) customerName = (customer.name || "").trim();
        if (!customerPhone) customerPhone = customer.phone || null;
        if (args.customerOptedOut == null) customerOptedOut = customer.opted_out === true;
      }
    }
    if (!customerName) customerName = "Customer";

    if (customerOptedOut) {
      console.log("Customer opted out — skipping deposit WhatsApp");
      return { ok: true, skipped: "opted_out" };
    }
    if (!customerPhone) {
      console.log("No customer phone — skipping deposit WhatsApp");
      return { ok: true, skipped: "no_phone" };
    }

    // Per-org SumUp credentials. No global fallback by design.
    const credsResult = await resolveSumUpCredentials({
      organisationId: orgId,
      loadConfig: makeRestSumUpConfigLoader(supabaseUrl, headers),
    });

    if (!credsResult.ok || !credsResult.credentials) {
      console.error(
        "SumUp credentials unavailable for organisation — skipping deposit link",
        { organisation_id: orgId, reason: credsResult.error },
      );
      return { ok: true, skipped: "no_sumup_credentials", error: credsResult.error };
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
      // Attempt tracking (payment_checkout_attempts) — pass-through only.
      supabaseUrl,
      headers,
      organisationId: orgId,
    });


    if (!checkout.ok || !checkout.url) {
      console.error("SumUp checkout creation failed:", checkout.error);
      return { ok: false, error: checkout.error ?? "sumup_checkout_failed" };
    }

    const paymentLink = checkout.url;

    // Shared reuse guard (BJ-0050b) already had a live PENDING checkout for
    // this job and amount — hand it back without re-sending anything.
    if (checkout.reused) {
      console.log("SumUp checkout reused — skipping duplicate deposit send", {
        service_call_id: serviceCallId,
        sumup_checkout_id: checkout.checkoutId,
      });
      return { ok: true, skipped: "checkout_already_pending", paymentLink, reused: true };
    }

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
      { headers },
    );
    const tiRows = await tiRes.json();
    const cfg = Array.isArray(tiRows) ? tiRows[0]?.config : null;
    if (cfg?.company_name) companyName = cfg.company_name;
    if (cfg?.company_phone) companyPhone = cfg.company_phone;

    // Resolve tenant-scoped 360Messenger API key
    const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const keyResolution = await fetchWhatsappApiKeyWithClient(sb as any, orgId);
    if (!keyResolution.apiKey) {
      const msg = keyResolution.detail || keyResolution.resolution;
      console.error("Deposit WhatsApp: no tenant-scoped API key:", msg);
      try {
        await logWhatsAppFailure(sb, {
          organisation_id: orgId,
          customer_id: customerId,
          message_type: "payment_link",
          content: `Deposit payment link for job ${serviceCallId} — config unavailable`,
          related_id: serviceCallId,
          related_type: "service_call",
          sent_by: "system",
          error_message: msg,
        });
      } catch { /* non-critical */ }
      return { ok: false, skipped: "no_whatsapp_key", paymentLink, error: msg };
    }
    const apiKey = keyResolution.apiKey;

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
        customer_id: customerId,
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
          function_name: "deposit-link",
          error_message: `Deposit WhatsApp failed. HTTP ${res.status}: ${resultText.substring(0, 300)}`,
          payload: { sent_to: cleanNumber, service_call_id: serviceCallId, customer_id: customerId },
        }),
      });
    }

    // Log customer activity on success
    if (result.success && customerId) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            organisation_id: orgId,
            customer_id: customerId,
            service_call_id: serviceCallId,
            event_type: "whatsapp_sent",
            event_label: "WhatsApp sent — Deposit Payment Request",
          }),
        });
      } catch { /* non-critical */ }
    }

    console.log("Deposit WhatsApp send result:", result.success ? "sent" : "failed");
    return {
      ok: !!result.success,
      sent: !!result.success,
      paymentLink,
      error: result.success ? undefined : `360Messenger HTTP ${res.status}`,
    };
  } catch (e) {
    console.error("sendDepositLink error:", e);
    return { ok: false, error: (e as Error).message };
  }
}
