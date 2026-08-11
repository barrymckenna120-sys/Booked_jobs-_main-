/**
 * Resolves which job a manually-logged "Confirmed" reply belongs to.
 *
 * Mirrors the rules used by the automated WhatsApp path in
 * supabase/functions/_shared/cancelIntent.ts: a job is only a candidate if it
 * is still upcoming, is booked/scheduled, and has actually had the 2-day
 * reminder sent. When more than one job qualifies we never guess.
 */

export type ConfirmCandidateJob = {
  id: string;
  scheduled_date: string | null;
  status: string | null;
  reminder_2day_sent: boolean | null;
};

export type ConfirmTargetDecision =
  | { action: "none"; reason: "no_eligible_job" }
  | { action: "act"; job: ConfirmCandidateJob }
  | { action: "ambiguous"; jobs: ConfirmCandidateJob[] };

const ELIGIBLE_STATUSES = ["booked", "scheduled"];

export function isEligibleConfirmJob(
  job: ConfirmCandidateJob,
  today: string
): boolean {
  if (!job) return false;
  if (job.reminder_2day_sent !== true) return false;
  if (!job.scheduled_date) return false;
  if (String(job.scheduled_date) < today) return false;
  const status = String(job.status ?? "").trim().toLowerCase();
  return ELIGIBLE_STATUSES.includes(status);
}

export function resolveConfirmTarget(
  jobs: ConfirmCandidateJob[] | null | undefined,
  today: string
): ConfirmTargetDecision {
  const eligible = (jobs ?? []).filter((j) => isEligibleConfirmJob(j, today));

  if (eligible.length === 0) return { action: "none", reason: "no_eligible_job" };
  if (eligible.length === 1) return { action: "act", job: eligible[0] };

  const sorted = [...eligible].sort((a, b) =>
    String(a.scheduled_date).localeCompare(String(b.scheduled_date))
  );
  return { action: "ambiguous", jobs: sorted };
}

/** Today's date as YYYY-MM-DD in the business timezone (Europe/Dublin). */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
}
