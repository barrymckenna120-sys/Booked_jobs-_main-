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
  /**
   * Newest attempt row for this job within the given organisation, or null.
   * The org filter is defense-in-depth: never scope tenant data on a job id
   * alone.
   */
  latest(
    serviceCallId: string,
    organisationId: string,
  ): Promise<{ checkoutId: string; checkoutReference: string } | null>;
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
    async latest(serviceCallId, organisationId) {
      const res = await doFetch(
        `${base}/rest/v1/payment_checkout_attempts?service_call_id=eq.${serviceCallId}` +
          `&organisation_id=eq.${organisationId}` +
          `&select=checkout_id,checkout_reference&order=created_at.desc&limit=1`,
        { headers },
      );
      const text = await res.text();
      if (!res.ok) return null;
      let rows: any;
      try {
        rows = JSON.parse(text);
      } catch {
        return null;
      }
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row?.checkout_id) return null;
      return {
        checkoutId: String(row.checkout_id),
        checkoutReference: String(row.checkout_reference ?? ""),
      };
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
      const text = await res.text();
      if (res.ok) return;

      // A unique violation on checkout_id means the attempt is already on
      // record — that is the correct end state, not a failure. Same
      // 23505-as-success reasoning as notifications_payment_failed_once.
      let code: string | undefined;
      try {
        code = JSON.parse(text)?.code;
      } catch { /* non-JSON error body */ }
      if (res.status === 409 || code === "23505") {
        console.warn(`sumup-checkout: attempt row already exists for ${row.checkoutId} — ignoring duplicate`);
        return;
      }
      // Any other failure is logged, never thrown: tracking must not be able
      // to fail a live checkout.
      console.error(`sumup-checkout: attempt record http ${res.status} for ${row.checkoutId}`);
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
  /** The reference the checkout carries (`jobId::attempt`). */
  checkoutReference?: string;
  /** True when an existing still-valid PENDING checkout was reused. */
  reused?: boolean;
  error?: string;
}

export const SUMUP_CHECKOUT_URL_BASE = "https://api.sumup.com/v0.1/checkouts";

export interface ReusableCheckout {
  checkoutId: string;
  checkoutReference: string;
  url: string;
}

/**
 * Returns the latest checkout for this job when it is still safe to reuse —
 * SumUp says PENDING, the amount matches what we are about to charge, and the
 * GET handed us a usable hosted checkout URL.
 *
 * Fail-closed: any lookup problem (non-2xx, unparseable body, network error,
 * missing URL) returns null so the caller creates a fresh attempt. Creating an
 * attempt is cheap and always succeeds; reusing a checkout we could not verify
 * is the real risk.
 */
export async function findReusableCheckout(args: {
  store: CheckoutAttemptStore | null;
  serviceCallId: string;
  organisationId?: string | null;
  requestedAmount: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<ReusableCheckout | null> {
  const { store, serviceCallId, organisationId, requestedAmount, apiKey } = args;
  const doFetch = args.fetchImpl ?? fetch;
  if (!store || !organisationId || !serviceCallId || !apiKey) return null;

  let row: { checkoutId: string; checkoutReference: string } | null = null;
  try {
    row = await store.latest(serviceCallId, organisationId);
  } catch (_e) {
    console.error(
      `sumup-checkout: latest attempt lookup failed for ${serviceCallId}: ${(_e as Error).message}`,
    );
    return null;
  }
  if (!row?.checkoutId) return null;

  let data: any;
  try {
    const res = await doFetch(
      `${SUMUP_CHECKOUT_URL_BASE}/${encodeURIComponent(row.checkoutId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error(`sumup-checkout: reuse lookup http ${res.status} for ${row.checkoutId}`);
      return null;
    }
    data = JSON.parse(text);
  } catch (_e) {
    console.error(
      `sumup-checkout: reuse lookup failed for ${row.checkoutId}: ${(_e as Error).message}`,
    );
    return null;
  }

  const status = String(data?.status ?? "").toUpperCase();
  if (status !== "PENDING") return null;

  const wanted = Math.round(requestedAmount * 100) / 100;
  const actual = Math.round(Number(data?.amount) * 100) / 100;
  if (!Number.isFinite(actual) || actual !== wanted) return null;

  const url = data?.hosted_checkout_url ?? data?.hosted_checkout?.url ?? null;
  if (!url) return null;

  return {
    checkoutId: row.checkoutId,
    checkoutReference: row.checkoutReference || String(data?.checkout_reference ?? ""),
    url: String(url),
  };
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

  const store = args.attemptStore ??
    (args.supabaseUrl && args.headers
      ? restAttemptStore(args.supabaseUrl, args.headers, doFetch)
      : null);

  // Reuse guard (BJ-0050b): a still-valid PENDING checkout for the same job and
  // amount is handed back instead of creating a needless duplicate.
  const reusable = await findReusableCheckout({
    store,
    serviceCallId,
    organisationId: args.organisationId,
    requestedAmount: roundedAmount,
    apiKey,
    fetchImpl: doFetch,
  });
  if (reusable) {
    return {
      ok: true,
      url: reusable.url,
      checkoutId: reusable.checkoutId,
      checkoutReference: reusable.checkoutReference,
      reused: true,
    };
  }


  // Attempt number, resolved right before the body is built so callers never
  // have to know about it. A failed count must not block the payment — it just
  // degrades to attempt 1.
  let attemptNumber = 1;
  if (store) {
    try {
      attemptNumber = (await store.count(serviceCallId)) + 1;
    } catch (_e) {
      console.error(`sumup-checkout: attempt count failed for ${serviceCallId}: ${(_e as Error).message}`);
      attemptNumber = 1;
    }
  }
  let checkoutReference = `${serviceCallId}::${attemptNumber}`;

  const post = (reference: string) =>
    doFetch(SUMUP_CHECKOUTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkout_reference: reference,
        amount: roundedAmount,
        currency: "EUR",
        merchant_code: merchantCode,
        hosted_checkout: { enabled: true },
        description: args.description ?? "Deposit - Job Booking",
        // Per-checkout webhook subscription — omitted only if not configured.
        ...(args.returnUrl ? { return_url: args.returnUrl } : {}),
      }),
    });

  let res: Response;
  try {
    res = await post(checkoutReference);
  } catch (_e) {
    return { ok: false, error: `sumup_request_failed: ${(_e as Error).message}` };
  }

  let text = await res.text();

  // SumUp remembers references forever, while our attempt counter can restart
  // (e.g. attempt rows pruned). A 409 DUPLICATED_CHECKOUT is therefore a
  // reference collision, not a real duplicate payment: retry once with a
  // collision-proof reference so the customer still gets a link.
  if (res.status === 409 && text.includes("DUPLICATED_CHECKOUT")) {
    const retryReference = `${serviceCallId}::${attemptNumber}-${Date.now()}`;
    console.warn(
      `sumup-checkout: reference ${checkoutReference} already exists at SumUp — retrying as ${retryReference}`,
    );
    try {
      res = await post(retryReference);
      checkoutReference = retryReference;
      text = await res.text();
    } catch (_e) {
      return { ok: false, error: `sumup_request_failed: ${(_e as Error).message}` };
    }
  }

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

  const checkoutId = data?.id ?? undefined;

  // Audit row for the attempt we just created. Swallowed on failure for the
  // same reason as the count above: the customer already has a live checkout.
  if (store && checkoutId && args.organisationId) {
    try {
      await store.record({
        serviceCallId,
        organisationId: args.organisationId,
        checkoutId,
        checkoutReference,
        status: (data?.status as string) ?? null,
      });
    } catch (_e) {
      console.error(`sumup-checkout: attempt record failed for ${checkoutId}: ${(_e as Error).message}`);
    }
  }

  return { ok: true, url, checkoutId, checkoutReference, reused: false };
}

