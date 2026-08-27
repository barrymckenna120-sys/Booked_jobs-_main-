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

// ------------------------------------------------------------------ sender

/**
 * One phone number can legitimately sit on several customer records — shared
 * household/landlord numbers, duplicates created over time, and (for staff test
 * numbers) records in more than one organisation.
 *
 * Resolving the sender to a single "newest" record is unsafe: the reminded job
 * may belong to one of the OTHER records, so a CANCEL silently matches nothing.
 * Instead every record sharing the number is returned, grouped by organisation,
 * and the caller feeds ALL of their jobs into `resolveReplyTarget` — which
 * already refuses to guess between multiple candidates and escalates to staff.
 *
 * Organisation choice is never guessed either: logging uses the newest record's
 * org (unchanged behaviour), while ACTING on a job requires that the eligible
 * jobs all sit in one org — see `pickActingOrg`.
 */
export type InboundCustomer = {
  id: string;
  /** Owning app user — required when writing whatsapp_messages (NOT NULL). */
  user_id?: string | null;
  organisation_id?: string | null;
  name?: string | null;
  phone?: string | null;
  landline_phone?: string | null;
  created_at?: string | null;
};

export type SenderOrgGroup = {
  organisation_id: string;
  customers: InboundCustomer[];
};

export type SenderDecision =
  | {
      action: "resolved";
      /** Newest matching record — reply/logging attribution only. */
      primary: InboundCustomer;
      /** Org of `primary`; where the inbound message is logged. */
      logging_organisation_id: string;
      /** Every matching record, newest first, across all orgs. */
      customers: InboundCustomer[];
      /** Same records grouped by org, newest-record org first. */
      orgs: SenderOrgGroup[];
    }
  | { action: "drop"; reason: "no_match" };

/**
 * Match an inbound number against candidate customer rows.
 * `matcher` compares numbers format-agnostically (last 9 significant digits).
 */
export function resolveInboundSender(
  from: string | null | undefined,
  customers: InboundCustomer[] | null | undefined,
  matcher: (a: unknown, b: unknown) => boolean,
): SenderDecision {
  const rows = (customers ?? []).filter(
    (c) =>
      !!c?.id &&
      !!c?.organisation_id &&
      (matcher(from, c.phone) || matcher(from, c.landline_phone)),
  );

  if (rows.length === 0) return { action: "drop", reason: "no_match" };

  const sorted = [...rows].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  const orgs: SenderOrgGroup[] = [];
  for (const c of sorted) {
    const orgId = String(c.organisation_id);
    const group = orgs.find((g) => g.organisation_id === orgId);
    if (group) group.customers.push(c);
    else orgs.push({ organisation_id: orgId, customers: [c] });
  }

  return {
    action: "resolved",
    primary: sorted[0],
    logging_organisation_id: String(sorted[0].organisation_id),
    customers: sorted,
    orgs,
  };
}

export type ActingOrgDecision =
  | { action: "act"; organisation_id: string; jobs: CandidateJob[] }
  | { action: "drop"; reason: "no_eligible_job" | "cross_org_ambiguous" };

/**
 * Decide which organisation an inbound CONFIRM/CANCEL may act in, given the
 * candidate jobs of every customer record sharing the number.
 *
 * Exactly one org with eligible jobs -> act there, even if it is not the org of
 * the newest record. Eligible jobs in two orgs -> never guess, drop and log.
 */
export function pickActingOrg(
  jobs: CandidateJob[] | null | undefined,
  today: string,
): ActingOrgDecision {
  const eligible = (jobs ?? []).filter((j) => isEligibleJob(j, today));
  if (eligible.length === 0) return { action: "drop", reason: "no_eligible_job" };

  const orgIds = [...new Set(eligible.map((j) => String(j.organisation_id ?? "")))];
  if (orgIds.length > 1) return { action: "drop", reason: "cross_org_ambiguous" };

  return { action: "act", organisation_id: orgIds[0], jobs: eligible };
}
