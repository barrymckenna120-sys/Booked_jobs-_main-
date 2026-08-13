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
  | "duplicate_check_failed"
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
  job_reference?: string | null;
}

/** What SumUp's GET /v0.1/checkouts/{id} tells us — the authoritative view. */
export interface SumUpCheckoutView {
  ok: boolean;
  status?: string;
  amount?: number | null;
  checkoutReference?: string | null;
  error?: string;
}

/**
 * Result of the reference-discovery pass used when a checkout id matches no job
 * (i.e. the checkout was created outside this system, so sumup_checkout_id was
 * never written back). ok:false means TRANSIENT (SumUp unreachable / 5xx) and is
 * retryable; ok:true with a null reference means "no account here owns this
 * checkout" and is a decision, not a failure.
 */
export interface SumUpCheckoutDiscovery {
  ok: boolean;
  reference?: string | null;
  /** Organisation whose credentials could read the checkout. */
  organisationId?: string | null;
  error?: string;
}

export interface SumUpWebhookDeps {
  /** Secret configured for this endpoint; missing = misconfigured server. */
  expectedSecret: string | null | undefined;
  /** Secret presented by the caller (query param or header). */
  presentedSecret: string | null | undefined;
  /** Raw request body text. */
  body: string;

  /** Finds the job that owns this checkout id. */
  loadJobByCheckoutId: (checkoutId: string) => Promise<SumUpWebhookJob | null>;
  /** Fallback lookup by service_calls.id (SumUp's checkout_reference). */
  loadJobById?: (jobId: string) => Promise<SumUpWebhookJob | null>;
  /** Fallback: asks SumUp which reference this checkout carries, and whose it is. */
  discoverCheckout?: (checkoutId: string) => Promise<SumUpCheckoutDiscovery>;
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
  /**
   * Claims this delivery. Returns true the first time a checkout id is seen and
   * false if it was already handled (unique violation on
   * sumup_webhook_events.checkout_id). Called before any write.
   */
  claimEvent?: (entry: {
    checkoutId: string;
    eventType: string | null;
    organisationId: string | null;
    serviceCallId: string;
  }) => Promise<boolean>;
  /**
   * Idempotency layer 2 signal. True when a DIFFERENT checkout id on this same
   * job already produced a claimed sumup_webhook_events row — i.e. a real,
   * verified payment was already recorded for the job. Must THROW on a genuine
   * query failure so the delivery is retried rather than double-applied.
   */
  hasOtherClaimedEvent?: (entry: {
    serviceCallId: string;
    checkoutId: string;
  }) => Promise<boolean>;
  /** One office notification per confirmed payment. */

  notifyOffice?: (entry: {
    organisationId: string | null;
    serviceCallId: string;
    customerId: string | null;
    jobReference: string | null;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * service_calls.id is a uuid, so anything else in checkout_reference cannot be
 * one of our jobs. Checked before any DB lookup — a checkout created by another
 * SumUp integration must never reach the database layer.
 */
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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

  let job = await deps.loadJobByCheckoutId(checkoutId);
  // True when the job was found via checkout_reference rather than by stored id,
  // so the id gets written back and any re-delivery matches directly.
  let backfillCheckoutId = false;

  if (!job && deps.discoverCheckout && deps.loadJobById) {
    // The checkout was created outside this system (e.g. Make calls SumUp's API
    // directly), so sumup_checkout_id was never stored. Ask SumUp which
    // reference it carries — the reference IS service_calls.id.
    const discovered = await deps.discoverCheckout(checkoutId);
    if (!discovered.ok) {
      log("error", `sumup-webhook: reference discovery failed for ${checkoutId}: ${discovered.error}`);
      // Transient only — retry rather than lose a real payment.
      return { outcome: "verification_failed", status: 502, error: discovered.error };
    }

    const reference = (discovered.reference ?? "").trim();
    if (!reference || !isUuid(reference)) {
      log(
        "error",
        `sumup-webhook: checkout ${checkoutId} has no usable checkout_reference (${reference || "empty"}) — ignoring`,
      );
      return { outcome: "no_matching_reference", status: 200 };
    }

    const candidate = await deps.loadJobById(reference);
    if (!candidate) {
      log("error", `sumup-webhook: checkout_reference ${reference} matches no service_call — ignoring`);
      return { outcome: "no_matching_reference", status: 200 };
    }

    // The credentials that could read the checkout must belong to the same
    // tenant as the job, or one tenant could confirm another's job.
    if (
      discovered.organisationId && candidate.organisation_id &&
      discovered.organisationId !== candidate.organisation_id
    ) {
      log(
        "error",
        `sumup-webhook: checkout ${checkoutId} belongs to org ${discovered.organisationId} but reference ${reference} is org ${candidate.organisation_id} — refusing`,
      );
      return { outcome: "reference_mismatch", status: 200, jobId: candidate.id };
    }

    job = candidate;
    backfillCheckoutId = true;
    log("info", `sumup-webhook: matched checkout ${checkoutId} to job ${job.id} via checkout_reference`);
  }

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

  // Idempotency, layer 1 — DUPLICATE DELIVERY of the same callback.
  // SumUp retries delivery (1 min / 5 min / 20 min / 2 h), always for the same
  // checkout id. sumup_webhook_events.checkout_id is UNIQUE, so the first
  // delivery claims it and every re-delivery is a no-op BEFORE paid_at is
  // stamped and BEFORE any notification is written. A genuinely separate second
  // payment on the same job is a different checkout id, so it still processes.
  if (deps.claimEvent) {
    const claimed = await deps.claimEvent({
      checkoutId,
      eventType: (parsed as Record<string, any>)?.event_type ?? null,
      organisationId: job.organisation_id,
      serviceCallId: job.id,
    });
    if (!claimed) {
      log("info", `sumup-webhook: checkout ${checkoutId} already processed — no-op`);
      return { outcome: "duplicate", status: 200, jobId: job.id, amount };
    }
  }

  // Idempotency, layer 2 — a SECOND, DIFFERENT payment that the job state says
  // is already covered (e.g. a deposit arriving after the job is fully paid).
  const alreadyPaid = job.payment_status === "paid";
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
      // Finance dates payments from paid_at; without it a deposit-only payment
      // is invisible on Finance -> Sales.
      paid_at: now().toISOString(),
      deposit_paid: true,
      balance_due: revenue > 0 ? Math.max(0, revenue - amount) : job.balance_due ?? null,
      payment_method: "card",
    };

  // Externally created checkouts (Make Scenario 5) never write a job total, which
  // would leave the payment invisible to Finance. Treat the paid amount as the
  // total so revenue is reported; a known total is never overwritten.
  if (revenue <= 0 && amount > 0) {
    patch.revenue = amount;
  }


  // Externally created checkout: store its id so a re-delivery matches directly
  // and hits the idempotency guard instead of discovering all over again.
  if (backfillCheckoutId) {
    patch.sumup_checkout_id = checkoutId;
  }


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

  if (deps.notifyOffice) {
    await deps.notifyOffice({
      organisationId: job.organisation_id,
      serviceCallId: job.id,
      customerId: job.customer_id ?? null,
      jobReference: job.job_reference ?? null,
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
