/**
 * SumUp hosted-checkout creation for quote deposits.
 *
 * Kept as a separate module (rather than inline in index.ts) so the payment
 * path can be unit-tested with an injected fetch — this is a money path and
 * must not regress silently.
 */

export interface SumUpDepositArgs {
  /** Deposit amount in EUR (major units, e.g. 99 = €99.00). */
  amount: number;
  /** service_calls.id — used as SumUp's checkout_reference. */
  serviceCallId: string;
  apiKey: string;
  merchantCode: string;
  /** Shown on the SumUp checkout page. Defaults to a deposit label. */
  description?: string;
  /**
   * Webhook callback registered with THIS checkout (SumUp has no account-level
   * webhook setting — subscription is per-checkout via return_url). Must be the
   * secret-bearing sumup-payment-webhook URL, otherwise the payment is never
   * confirmed back into the system. Built by buildSumUpReturnUrl().
   */
  returnUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Attempt-tracking (payment_checkout_attempts) — all optional. Supply
   * supabaseUrl + service-role headers + organisationId and every checkout is
   * numbered and recorded. Omit them (unit tests, legacy callers) and the
   * attempt number falls back to 1 and nothing is written; tracking must never
   * be able to fail a money path.
   */
  supabaseUrl?: string;
  headers?: Record<string, string>;
  organisationId?: string | null;
  /** Test seam replacing the PostgREST calls above. */
  attemptStore?: CheckoutAttemptStore;
}

export interface CheckoutAttemptStore {
  /** Existing attempt rows for this job. */
  count(serviceCallId: string): Promise<number>;
  record(row: {
    serviceCallId: string;
    organisationId: string;
    checkoutId: string;
    checkoutReference: string;
    status: string | null;
  }): Promise<void>;
}

/** PostgREST-backed attempt store; used when supabaseUrl + headers are given. */
function restAttemptStore(
  supabaseUrl: string,
  headers: Record<string, string>,
  doFetch: typeof fetch,
): CheckoutAttemptStore {
  const base = supabaseUrl.replace(/\/+$/, "");
  return {
    async count(serviceCallId) {
      const res = await doFetch(
        `${base}/rest/v1/payment_checkout_attempts?service_call_id=eq.${serviceCallId}&select=id`,
        { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } },
      );
      const range = res.headers.get("content-range") ?? "";
      await res.text();
      const total = Number(range.split("/")[1]);
      return Number.isFinite(total) ? total : 0;
    },
    async record(row) {
      const res = await doFetch(`${base}/rest/v1/payment_checkout_attempts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          service_call_id: row.serviceCallId,
          organisation_id: row.organisationId,
          checkout_id: row.checkoutId,
          checkout_reference: row.checkoutReference,
          status: row.status,
        }),
      });
      await res.text();
    },
  };
}


/**
 * Builds the per-checkout webhook callback URL for sumup-payment-webhook.
 * Returns null when either input is missing, so a caller can log loudly rather
 * than silently create a checkout that can never be confirmed.
 */
export function buildSumUpReturnUrl(
  supabaseUrl: string | undefined | null,
  webhookSecret: string | undefined | null,
): string | null {
  const base = (supabaseUrl ?? "").trim().replace(/\/+$/, "");
  const secret = (webhookSecret ?? "").trim();
  if (!base || !secret) return null;
  return `${base}/functions/v1/sumup-payment-webhook?s=${encodeURIComponent(secret)}`;
}


export interface SumUpDepositResult {
  ok: boolean;
  /** hosted_checkout_url — what we save and send to the customer. */
  url?: string;
  checkoutId?: string;
  error?: string;
}

export const SUMUP_CHECKOUTS_URL = "https://api.sumup.com/v0.1/checkouts";

/**
 * Creates a SumUp hosted checkout and returns its hosted_checkout_url.
 * Never throws — always resolves to a result the caller can branch on, so a
 * SumUp outage can never take down quote acceptance.
 */
export async function createSumUpDepositCheckout(
  args: SumUpDepositArgs,
): Promise<SumUpDepositResult> {
  const { amount, serviceCallId, apiKey, merchantCode } = args;
  const doFetch = args.fetchImpl ?? fetch;

  if (!(amount > 0)) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!serviceCallId) {
    return { ok: false, error: "missing_checkout_reference" };
  }
  if (!apiKey || !merchantCode) {
    return { ok: false, error: "missing_sumup_credentials" };
  }

  // SumUp takes major units with up to 2 decimals, not cents.
  const roundedAmount = Math.round(amount * 100) / 100;

  let res: Response;
  try {
    res = await doFetch(SUMUP_CHECKOUTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkout_reference: serviceCallId,
        amount: roundedAmount,
        currency: "EUR",
        merchant_code: merchantCode,
        hosted_checkout: { enabled: true },
        description: args.description ?? "Deposit - Job Booking",
        // Per-checkout webhook subscription — omitted only if not configured.
        ...(args.returnUrl ? { return_url: args.returnUrl } : {}),
      }),

    });
  } catch (_e) {
    return { ok: false, error: `sumup_request_failed: ${(_e as Error).message}` };
  }

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok) {
    return { ok: false, error: `sumup_http_${res.status}: ${text.slice(0, 300)}` };
  }

  const url = data?.hosted_checkout_url ?? data?.hosted_checkout?.url ?? null;
  if (!url) {
    return { ok: false, error: `sumup_missing_hosted_checkout_url: ${text.slice(0, 300)}` };
  }

  return { ok: true, url, checkoutId: data?.id ?? undefined };
}
