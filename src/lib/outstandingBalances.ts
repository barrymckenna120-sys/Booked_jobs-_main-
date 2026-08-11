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
