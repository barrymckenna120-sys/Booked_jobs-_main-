/**
 * Payment reconciliation — detection only.
 *
 * Mirrors the `payment_reconciliation_exceptions` database view predicate so the
 * flagging rule is testable in isolation. This module NEVER writes, recalculates
 * or corrects payment state; it only decides whether a job looks out of step
 * with the money recorded against it in the `job_payments` ledger.
 */

export interface ReconciliationCandidate {
  revenue: number | null;
  balance_due: number | null;
  payment_status: string | null;
  payment_method: string | null;
  /** Sum of positive `job_payments.amount` rows for the job. */
  ledger_total: number;
  payment_count: number;
}

/** Tolerance in euro — anything at or under this is rounding noise, not a mismatch. */
const TOLERANCE = 0.01;

export type ExceptionReason = "unpaid_but_covered" | "stale_balance";

/**
 * Returns the reasons a job is a reconciliation exception. Empty array = healthy.
 */
export const exceptionReasons = (job: ReconciliationCandidate): ExceptionReason[] => {
  const reasons: ExceptionReason[] = [];

  // Invoice settlements are handled outside the payment ledger.
  if ((job.payment_method ?? "") === "invoice") return reasons;
  if (job.payment_count <= 0 || job.ledger_total <= 0) return reasons;

  const revenue = job.revenue ?? 0;
  if (revenue <= 0) return reasons;

  // The ledger covers the full price, yet the job is not marked paid.
  if (job.ledger_total >= revenue && (job.payment_status ?? "") !== "paid") {
    reasons.push("unpaid_but_covered");
  }

  // What the job claims was collected (revenue - balance_due) disagrees with the ledger.
  if (job.balance_due !== null && job.balance_due !== undefined) {
    const impliedCollected = revenue - job.balance_due;
    if (Math.abs(impliedCollected - job.ledger_total) > TOLERANCE) {
      reasons.push("stale_balance");
    }
  }

  return reasons;
};

export const isReconciliationException = (job: ReconciliationCandidate): boolean =>
  exceptionReasons(job).length > 0;

export const REASON_LABELS: Record<ExceptionReason, string> = {
  unpaid_but_covered: "Paid in full but not marked paid",
  stale_balance: "Balance disagrees with recorded payments",
};
