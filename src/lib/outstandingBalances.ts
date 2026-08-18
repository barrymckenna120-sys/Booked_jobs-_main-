/**
 * Which jobs belong in Finance → Sales → Outstanding Balances.
 *
 * A job qualifies once money is owed AND the job has reached a point where
 * chasing it makes sense: it has been invoiced, it is an invoice-method job, or
 * a payment has already been taken against it (e.g. a SumUp card deposit on a
 * job that has not been invoiced yet).
 */
export type OutstandingCandidate = {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  invoiced_at?: string | null;
  deposit_paid?: boolean | null;
  balance_due?: number | string | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
};

export function isOutstandingBalanceJob(job: OutstandingCandidate): boolean {
  if ((job.payment_status || "").toLowerCase() === "paid") return false;
  if ((job.status || "").toLowerCase() === "cancelled") return false;
  if (num(job.balance_due) <= 0) return false;

  return (
    !!job.invoiced_at ||
    (job.payment_method || "").toLowerCase() === "invoice" ||
    job.deposit_paid === true
  );
}

/**
 * The amount actually owed on a job.
 *
 * balance_due is the authoritative field (kept in sync by buildPaymentPatch on
 * every payment write). The revenue - deposit_amount derivation is only a
 * fallback for legacy rows that never had balance_due written.
 */
export function outstandingBalanceAmount(job: {
  balance_due?: number | string | null;
  revenue?: number | string | null;
  deposit_amount?: number | string | null;
}): number {
  const stored = num(job.balance_due);
  if (stored > 0) return stored;
  return Math.max(0, num(job.revenue) - num(job.deposit_amount));
}
