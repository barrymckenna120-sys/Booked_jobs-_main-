/**
 * SumUp payment-confirmation handling (pure, dependency-injected).
 *
 * MONEY PATH. This is what tells the system a SumUp checkout was actually paid,
 * which is what makes the payment appear on the finance/sales-ledger screens.
 *
 * Trust model — the callback body is a HINT ONLY. SumUp's checkout webhook is
 * unsigned (there is no signature header; the payload is just
 * {event_type, id}), and SumUp's docs name re-fetching the checkout from their
 * API as THE verification method — not a backup layer. So:
 *   1. The return_url we register per checkout carries an unguessable secret
 *      (?s=... / x-webhook-secret), so the endpoint is not publicly callable.
 *   2. The checkout is then re-fetched from SumUp with the OWNING ORG's own
 *      credentials, and only the status/amount/reference SumUp returns are
 *      trusted. A forged body therefore cannot mark anything paid.
 *
 * Every decided path answers 200 — SumUp retries on anything else (fixed
 * schedule: 1 min, 5 min, 20 min, 2 hours; 4 attempts total), and a retry
 * cannot change a decision we have already made. Only genuinely transient
 * failures (SumUp unreachable, DB write failed) return a retryable status, and
 * callers with a bad secret get 401 (never acknowledged).
 *
 * The owning organisation is resolved by matching the checkout id against
 * service_calls.sumup_checkout_id (written when the checkout was created), so
 * credentials are never guessed and one tenant can never confirm another's job.
 */


export type SumUpWebhookOutcome =
  | "not_configured"
  | "unauthorized"
  | "bad_request"


  | "missing_checkout_id"
  | "no_matching_reference"
  | "reference_mismatch"
  | "credentials_unavailable"
  | "verification_failed"
  | "not_paid"
  | "duplicate"
  | "paid"
  | "part_paid"
  | "update_failed";

export interface SumUpWebhookJob {
  id: string;
  organisation_id: string | null;
  customer_id: string | null;
  revenue: number | null;
  balance_due: number | null;
  deposit_paid: boolean | null;
  payment_status: string | null;
  paid_at: string | null;
}

/** What SumUp's GET /v0.1/checkouts/{id} tells us — the authoritative view. */
export interface SumUpCheckoutView {
  ok: boolean;
  status?: string;
  amount?: number | null;
  checkoutReference?: string | null;
  error?: string;
}

export interface SumUpWebhookDeps {
  /** Secret configured for this endpoint; missing = misconfigured server. */
  expectedSecret: string | null | undefined;
  /** Secret presented by the caller (query param or header). */
  presentedSecret: string | null | undefined;
  /** Value of SumUp's `x-payload-signature` header, if sent. */
  signatureHeader?: string | null;
  /**
   * Verifies the raw body against the signature header. When omitted the
   * signature layer is skipped (secret + re-fetch still apply).
   */
  verifySignature?: (body: string, signatureHeader: string) => Promise<boolean>;
  /**
   * When true, a delivery with no signature header is rejected. Off by default
   * so a SumUp API version that omits the header can't silently block payments.
   */
  requireSignature?: boolean;
  /** Raw request body text. */
  body: string;

  /** Finds the job that owns this checkout id. */
  loadJobByCheckoutId: (checkoutId: string) => Promise<SumUpWebhookJob | null>;
  /** Re-reads the checkout from SumUp using the owning org's credentials. */
  fetchCheckout: (checkoutId: string, organisationId: string) => Promise<SumUpCheckoutView>;
  /** Applies the payment patch. Returns false on failure. */
  updateJob: (jobId: string, patch: Record<string, unknown>) => Promise<boolean>;
  /** One timeline entry per confirmed payment. */
  logActivity?: (entry: {
    organisationId: string | null;
    customerId: string | null;
    serviceCallId: string;
    amount: number;
    fullyPaid: boolean;
  }) => Promise<void>;
  /** One message_log entry per confirmed payment. */
  logMessage?: (entry: {
    organisationId: string | null;
    customerId: string | null;
    serviceCallId: string;
    amount: number;
    fullyPaid: boolean;
  }) => Promise<void>;
  /** Injectable clock for tests. */
  now?: () => Date;
  log?: (level: "info" | "error", message: string, detail?: unknown) => void;
}

export interface SumUpWebhookResult {
  outcome: SumUpWebhookOutcome;
  /** HTTP status the endpoint should return. */
  status: number;
  jobId?: string;
  amount?: number;
  patch?: Record<string, unknown>;
  error?: string;
}

const PAID_STATUSES = new Set(["PAID", "SUCCESSFUL", "SUCCEEDED"]);

/** Constant-time-ish comparison so the secret can't be probed byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies SumUp's `x-payload-signature` header: HMAC-SHA256 over the RAW
 * request body, keyed with the webhook secret. Accepts hex or base64 digests,
 * and tolerates a `sha256=` prefix. Never throws.
 */
export async function verifySumUpSignature(
  body: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const presented = signatureHeader.trim().replace(/^sha256=/i, "");
    if (!presented || !secret) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    );

    const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
    const b64 = btoa(String.fromCharCode(...mac));

    return secretsMatch(presented.toLowerCase(), hex) || secretsMatch(presented, b64);
  } catch (_e) {
    return false;
  }
}


/** Pulls a checkout id out of any of SumUp's event body shapes. */
export function extractCheckoutId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;
  const candidates = [
    b.id,
    b.checkout_id,
    b.resource_id,
    b.payload?.id,
    b.payload?.checkout_id,
    b.data?.id,
    b.object?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export async function handleSumUpWebhook(
  deps: SumUpWebhookDeps,
): Promise<SumUpWebhookResult> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());

  const expected = (deps.expectedSecret ?? "").trim();
  if (!expected) {
    log("error", "sumup-webhook: SUMUP_WEBHOOK_SECRET not configured");
    return { outcome: "not_configured", status: 500 };
  }

  const presented = (deps.presentedSecret ?? "").trim();
  if (!presented || !secretsMatch(presented, expected)) {
    log("error", "sumup-webhook: rejected callback with missing/invalid secret");
    return { outcome: "unauthorized", status: 401 };
  }

  // Layer 1 — SumUp's own signature over the raw body.
  const signature = (deps.signatureHeader ?? "").trim();
  if (deps.verifySignature) {
    if (!signature) {
      if (deps.requireSignature) {
        log("error", "sumup-webhook: delivery had no x-payload-signature header");
        return { outcome: "invalid_signature", status: 401 };
      }
      log("info", "sumup-webhook: no x-payload-signature header — relying on secret + re-fetch");
    } else if (!(await deps.verifySignature(deps.body, signature))) {
      log("error", "sumup-webhook: x-payload-signature did not verify");
      return { outcome: "invalid_signature", status: 401 };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(deps.body);
  } catch {
    log("error", "sumup-webhook: unparseable body", deps.body.slice(0, 300));
    // 200: a retry of the same malformed body cannot succeed.
    return { outcome: "bad_request", status: 200, error: "invalid_json" };
  }

  const checkoutId = extractCheckoutId(parsed);
  if (!checkoutId) {
    log("error", "sumup-webhook: no checkout id in body", deps.body.slice(0, 300));
    return { outcome: "missing_checkout_id", status: 200 };
  }


  const job = await deps.loadJobByCheckoutId(checkoutId);
  if (!job) {
    // Loud, never silent — but 200 so SumUp stops retrying a reference we will
    // never recognise (e.g. a checkout created outside this system).
    log("error", `sumup-webhook: no service_call matches checkout ${checkoutId} — ignoring`);
    return { outcome: "no_matching_reference", status: 200 };
  }

  if (!job.organisation_id) {
    log("error", `sumup-webhook: job ${job.id} has no organisation_id — cannot verify`);
    return { outcome: "credentials_unavailable", status: 200, jobId: job.id };
  }

  const view = await deps.fetchCheckout(checkoutId, job.organisation_id);
  if (!view.ok) {
    log("error", `sumup-webhook: verification failed for ${checkoutId}: ${view.error}`);
    // Retryable — SumUp outage or credential problem, not a decision.
    return { outcome: "verification_failed", status: 502, jobId: job.id, error: view.error };
  }

  if (view.checkoutReference && view.checkoutReference !== job.id) {
    log(
      "error",
      `sumup-webhook: checkout ${checkoutId} reference ${view.checkoutReference} does not match job ${job.id}`,
    );
    return { outcome: "reference_mismatch", status: 200, jobId: job.id };
  }

  const status = (view.status ?? "").toUpperCase();
  if (!PAID_STATUSES.has(status)) {
    log("info", `sumup-webhook: checkout ${checkoutId} status ${status || "unknown"} — no payment recorded`);
    return { outcome: "not_paid", status: 200, jobId: job.id };
  }

  const amount = Number(view.amount ?? 0);
  const revenue = Number(job.revenue ?? 0);
  const fullyPaid = revenue > 0 ? amount + 1e-9 >= revenue : amount > 0;

  // Idempotency: a second delivery of the same paid event must not overwrite
  // paid_at or write a second activity entry.
  const alreadyPaid = job.payment_status === "paid" || !!job.paid_at;
  const alreadyPartPaid = job.payment_status === "partial" || job.deposit_paid === true;
  if (alreadyPaid || (!fullyPaid && alreadyPartPaid)) {
    log("info", `sumup-webhook: duplicate delivery for job ${job.id} — no-op`);
    return { outcome: "duplicate", status: 200, jobId: job.id, amount };
  }

  const patch: Record<string, unknown> = fullyPaid
    ? {
      payment_status: "paid",
      paid_at: now().toISOString(),
      deposit_paid: true,
      balance_due: 0,
      payment_method: "card",
    }
    : {
      payment_status: "partial",
      deposit_paid: true,
      balance_due: revenue > 0 ? Math.max(0, revenue - amount) : job.balance_due ?? null,
      payment_method: "card",
    };

  const ok = await deps.updateJob(job.id, patch);
  if (!ok) {
    log("error", `sumup-webhook: failed to update job ${job.id}`);
    return { outcome: "update_failed", status: 500, jobId: job.id, amount, patch };
  }

  if (deps.logActivity) {
    await deps.logActivity({
      organisationId: job.organisation_id,
      customerId: job.customer_id,
      serviceCallId: job.id,
      amount,
      fullyPaid,
    });
  }
  if (deps.logMessage) {
    await deps.logMessage({
      organisationId: job.organisation_id,
      customerId: job.customer_id,
      serviceCallId: job.id,
      amount,
      fullyPaid,
    });
  }

  log("info", `sumup-webhook: job ${job.id} → ${fullyPaid ? "paid" : "partial"} (€${amount})`);
  return {
    outcome: fullyPaid ? "paid" : "part_paid",
    status: 200,
    jobId: job.id,
    amount,
    patch,
  };
}
