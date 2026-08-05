/**
 * Inbound WhatsApp reply intent parsing + safe job matching.
 *
 * The 2-day reminder (job-reminder-2day) tells customers to reply CONFIRM or
 * CANCEL, so inbound replies must be honoured. Cancelling the WRONG job is far
 * worse than cancelling none, so matching is deliberately strict:
 *
 *  - exactly one candidate job  -> act on it
 *  - zero candidates            -> reply "call us", do nothing
 *  - two or more candidates     -> NEVER guess. Reply "call us" AND escalate to
 *                                  staff (notification + follow-up flag) so the
 *                                  request becomes a visible task, not a silent
 *                                  drop.
 *
 * Candidates are further restricted to jobs scheduled today or later — a
 * customer reminded weeks ago whose job was never marked Completed must not be
 * a match, otherwise "exactly one" is not actually exact.
 *
 * All functions here are pure so they are directly unit-testable.
 */

export type InboundIntent = "stop" | "confirm" | "cancel" | "unknown";

/** Normalise a raw inbound message body to a known intent. */
export function parseInboundIntent(raw: string | null | undefined): InboundIntent {
  const text = String(raw ?? "")
    .trim()
    // strip surrounding punctuation/emoji-ish noise: "CANCEL." / "*STOP*"
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
    .toLowerCase();

  if (text === "stop") return "stop";
  if (text === "confirm" || text === "yes") return "confirm";
  if (text === "cancel") return "cancel";
  return "unknown";
}

export type CandidateJob = {
  id: string;
  status?: string | null;
  scheduled_date?: string | null;
  time_block?: string | null;
  organisation_id?: string | null;
  reminder_2day_sent?: boolean | null;
};

const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

/**
 * Is this job a valid target for an inbound CONFIRM/CANCEL reply?
 * `today` is a YYYY-MM-DD string in the business timezone (Europe/Dublin).
 */
export function isEligibleJob(job: CandidateJob, today: string): boolean {
  if (!job?.id) return false;
  if (job.reminder_2day_sent !== true) return false;
  if (CLOSED_STATUSES.has(String(job.status ?? "").trim().toLowerCase())) return false;
  const date = job.scheduled_date;
  if (!date) return false;
  // Lexicographic comparison is safe for zero-padded YYYY-MM-DD.
  return String(date).slice(0, 10) >= today;
}

export type MatchDecision =
  | { action: "act"; job: CandidateJob }
  | { action: "none"; reason: "no_eligible_job" }
  | { action: "escalate"; reason: "ambiguous_multiple_jobs"; jobs: CandidateJob[] };

/**
 * Pick the single job an inbound reply refers to, or refuse to guess.
 * On ambiguity the soonest job is returned first in `jobs` so callers can
 * attach the staff follow-up to the most imminent booking.
 */
export function resolveReplyTarget(jobs: CandidateJob[] | null | undefined, today: string): MatchDecision {
  const eligible = (jobs ?? []).filter((j) => isEligibleJob(j, today));

  if (eligible.length === 0) return { action: "none", reason: "no_eligible_job" };
  if (eligible.length === 1) return { action: "act", job: eligible[0] };

  const sorted = [...eligible].sort((a, b) =>
    String(a.scheduled_date).localeCompare(String(b.scheduled_date))
  );
  return { action: "escalate", reason: "ambiguous_multiple_jobs", jobs: sorted };
}

/** Today's date as YYYY-MM-DD in the business timezone (Europe/Dublin). */
export function businessToday(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
}
