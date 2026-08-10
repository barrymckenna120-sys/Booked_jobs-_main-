// Finance metric helpers — revenue is recognised from payment_status, not job status.
// "Jobs Completed" remains a separate, job-status-based metric.

export type FinanceJob = {
  id?: string;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  revenue?: number | string | null;
  balance_due?: number | string | null;
  deposit_amount?: number | string | null;
  paid_at?: string | null;
  completed_at?: string | null;
  scheduled_date?: string | null;
  job_type?: string | null;
  customers?: { name?: string | null } | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
};

export const PAID_STATUSES = ["paid", "part_paid"] as const;

/** A job counts towards revenue once money has actually been taken. */
export function isRevenueRecognised(job: FinanceJob): boolean {
  const ps = (job.payment_status || "").toLowerCase();
  if (!(PAID_STATUSES as readonly string[]).includes(ps)) return false;
  return (job.status || "").toLowerCase() !== "cancelled";
}

/**
 * Amount actually collected on a job.
 * - paid:      the full job total (revenue), falling back to the deposit figure
 *              when Scenario-5-style flows never wrote a job total.
 * - part_paid: total minus outstanding balance, falling back to the deposit.
 */
export function collectedAmount(job: FinanceJob): number {
  const ps = (job.payment_status || "").toLowerCase();
  const revenue = num(job.revenue);
  const balance = num(job.balance_due);
  const deposit = num(job.deposit_amount);

  if (ps === "paid") return revenue > 0 ? revenue : deposit;
  if (ps === "part_paid") {
    if (revenue > 0) return Math.max(0, revenue - balance);
    return deposit;
  }
  return 0;
}

/** Date a payment should be attributed to. */
export function revenueDate(job: FinanceJob): Date | null {
  const src = job.paid_at || job.completed_at || job.scheduled_date;
  if (!src) return null;
  const d = src.length === 10 ? new Date(src + "T12:00:00") : new Date(src);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date a completed job should be attributed to (Jobs Completed metric). */
export function completionDate(job: FinanceJob): Date | null {
  const src = job.completed_at || job.scheduled_date;
  if (!src) return null;
  const d = src.length === 10 ? new Date(src + "T12:00:00") : new Date(src);
  return Number.isNaN(d.getTime()) ? null : d;
}

const inRange = (d: Date | null, start: Date, end: Date) => !!d && d >= start && d <= end;

/** Jobs whose payments fall in the period — the revenue basis. */
export function paidJobsInPeriod(jobs: FinanceJob[], start: Date, end: Date): FinanceJob[] {
  return jobs.filter(j => isRevenueRecognised(j) && inRange(revenueDate(j), start, end));
}

/** Jobs marked Completed in the period — the delivery basis. */
export function completedJobsInPeriod(jobs: FinanceJob[], start: Date, end: Date): FinanceJob[] {
  return jobs.filter(
    j => (j.status || "").toLowerCase() === "completed" && inRange(completionDate(j), start, end),
  );
}

export function periodRevenue(jobs: FinanceJob[], start: Date, end: Date): number {
  return paidJobsInPeriod(jobs, start, end).reduce((s, j) => s + collectedAmount(j), 0);
}

/** Money still owed: work done or part-paid, with a balance outstanding. */
export function outstandingTotal(jobs: FinanceJob[]): number {
  return jobs
    .filter(j => {
      const ps = (j.payment_status || "").toLowerCase();
      if (ps === "paid") return false;
      if ((j.status || "").toLowerCase() === "cancelled") return false;
      if (!j.completed_at && !j.paid_at) return false;
      return num(j.balance_due) > 0;
    })
    .reduce((s, j) => s + num(j.balance_due), 0);
}

export const isoDay = (d: Date | null): string =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
