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
  deposit_required?: boolean | null;
  deposit_paid?: boolean | null;
  balance_due?: number | string | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
};

const EXCLUDED_STATUSES = new Set(["cancelled", "archived"]);

export function isOutstandingBalanceJob(job: OutstandingCandidate): boolean {
  if ((job.payment_status || "").toLowerCase() === "paid") return false;
  if (EXCLUDED_STATUSES.has((job.status || "").toLowerCase())) return false;
  if (num(job.balance_due) <= 0) return false;

  return (
    !!job.invoiced_at ||
    (job.payment_method || "").toLowerCase() === "invoice" ||
    job.deposit_paid === true ||
    // A deposit was requested and has not been paid yet (deposit_paid is
    // already known to be non-true on this branch) — still worth chasing.
    job.deposit_required === true

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

/**
 * Total money actually received against a job.
 *
 * Derived from the job total minus the outstanding balance, so it stays correct
 * after several part payments (deposit_amount only ever describes the first
 * deposit). Falls back to the collected deposit for legacy rows with no
 * revenue/balance figures. Never negative, never above the job total.
 */
export function amountPaidOnJob(job: {
  revenue?: number | string | null;
  balance_due?: number | string | null;
  deposit_amount?: number | string | null;
  deposit_paid?: boolean | null;
  payment_status?: string | null;
}): number {
  const revenue = num(job.revenue);
  const deposit = job.deposit_paid === true ? num(job.deposit_amount) : 0;

  if ((job.payment_status || "").toLowerCase() === "paid") {
    return revenue > 0 ? revenue : deposit;
  }

  if (revenue > 0) {
    const balance = num(job.balance_due);
    // A zero/absent balance on an unsettled job is a legacy row — fall back to
    // the deposit rather than claiming the whole job total was collected.
    if (balance > 0) return Math.min(revenue, Math.max(0, revenue - balance));
    return Math.min(revenue, deposit);
  }

  return deposit;
}
