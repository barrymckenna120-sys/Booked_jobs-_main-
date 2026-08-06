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
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
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
        description: "Deposit - Job Booking",
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
