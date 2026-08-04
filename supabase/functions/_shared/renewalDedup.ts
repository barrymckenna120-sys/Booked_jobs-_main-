/**
 * Shared renewal-reminder dedup logic.
 *
 * Reminder "already sent" state is tracked at TWO levels:
 *   - customers.reminder_30_days_sent / reminder_14_days_sent / reminder_7_days_sent
 *     -> the source of truth, works even when the customer has no job on file
 *   - service_calls.reminder_30day_sent / reminder_14day_sent / reminder_2day_sent
 *     -> legacy job-level flags, kept in sync for reporting + existing Make scenarios
 *
 * Historically only the job-level flag was checked. Customers with zero jobs
 * (22/61 for K&N, 6/12 for Dublin Gas at time of writing) had no row to mark, so
 * they were never suppressed and would be re-messaged on every daily run.
 * Checking the customer-level flag first closes that hole.
 */

export type ReminderKind = "30day" | "14day" | "7day" | "2day";

/** customers.<column> — null when the cadence has no customer-level column. */
export const CUSTOMER_REMINDER_COLUMN: Record<ReminderKind, string | null> = {
  "30day": "reminder_30_days_sent",
  "14day": "reminder_14_days_sent",
  "7day": "reminder_7_days_sent",
  "2day": null, // 2-day is a job appointment reminder, meaningless without a job
};

/** service_calls.<column> — null when the cadence has no job-level column. */
export const JOB_REMINDER_COLUMN: Record<ReminderKind, string | null> = {
  "30day": "reminder_30day_sent",
  "14day": "reminder_14day_sent",
  "7day": null,
  "2day": "reminder_2day_sent",
};

export interface DedupCustomer {
  id: string;
  reminder_30_days_sent?: boolean | null;
  reminder_14_days_sent?: boolean | null;
  reminder_7_days_sent?: boolean | null;
}

export interface DedupLatestJob {
  reminder_30day_sent?: boolean | null;
  reminder_14day_sent?: boolean | null;
  reminder_2day_sent?: boolean | null;
}

/**
 * True when this customer has already been sent the given reminder.
 * Customer-level flag wins; the job-level flag is only a fallback so that
 * customers already marked under the old job-only scheme aren't re-messaged.
 */
export function alreadyReminded(
  customer: DedupCustomer,
  latestJob: DedupLatestJob | undefined,
  kind: ReminderKind,
): boolean {
  const custCol = CUSTOMER_REMINDER_COLUMN[kind];
  if (custCol && (customer as Record<string, unknown>)[custCol] === true) return true;

  const jobCol = JOB_REMINDER_COLUMN[kind];
  if (jobCol && latestJob && (latestJob as Record<string, unknown>)[jobCol] === true) return true;

  return false;
}

/**
 * Customers still owed this reminder: no upcoming job booked, and not already reminded.
 */
export function filterDueCustomers<T extends DedupCustomer>(
  customers: T[],
  bookedCustomerIds: Set<string>,
  latestJobByCustomer: Map<string, DedupLatestJob>,
  kind: ReminderKind,
): T[] {
  return customers
    .filter((c) => !bookedCustomerIds.has(c.id))
    .filter((c) => !alreadyReminded(c, latestJobByCustomer.get(c.id), kind));
}
