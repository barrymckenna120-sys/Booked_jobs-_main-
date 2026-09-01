/**
 * BJ-0131a — job-level duplicate detection (frontend side).
 *
 * The canonical matching implementation is the database function
 * `public.find_duplicate_job(...)`, shared with the Tally Edge Functions
 * (`supabase/functions/_shared/duplicateJob.ts`). Organisation scoping, phone
 * normalisation (mirror of `normalisePhoneE164`), exact job_type equality,
 * trimmed literal address equality, the 60-minute rolling window and
 * self-exclusion all live in that one place.
 *
 * This module holds the typed call site plus the small pure helpers used for
 * acknowledgment invalidation, which are unit-tested.
 */
import { supabase } from "@/integrations/supabase/client";

export const DUPLICATE_WINDOW_MINUTES = 60;

export type DuplicateJobMatch = {
  id: string;
  jobReference: string | null;
  jobType: string;
  address: string | null;
  customerName: string | null;
  createdAt: string;
};

export type DuplicateJobInput = {
  organisationId: string;
  phone: string;
  jobType: string;
  address: string;
  windowMinutes?: number;
  excludeServiceCallId?: string;
};

/**
 * Identity of the exact combination that was checked. An acknowledgment is only
 * valid for the key it was given for — changing phone, job type or address
 * invalidates it.
 */
export function duplicateMatchKey(input: {
  phone?: string | null;
  jobType?: string | null;
  address?: string | null;
}): string {
  return [
    (input.phone ?? "").trim(),
    (input.jobType ?? "").trim(),
    (input.address ?? "").trim(),
  ].join("|");
}

/** True when the inputs are complete enough to be worth a lookup. */
export function canCheckDuplicate(input: Partial<DuplicateJobInput>): boolean {
  return Boolean(
    input.organisationId &&
      (input.phone ?? "").trim() &&
      (input.jobType ?? "").trim() &&
      (input.address ?? "").trim(),
  );
}

/** RPC arguments — kept pure so the contract is testable. */
export function duplicateRpcArgs(input: DuplicateJobInput) {
  return {
    p_organisation_id: input.organisationId,
    p_phone: (input.phone ?? "").trim(),
    p_job_type: input.jobType,
    p_address: (input.address ?? "").trim(),
    p_window_minutes: input.windowMinutes ?? DUPLICATE_WINDOW_MINUTES,
    p_exclude_service_call_id: input.excludeServiceCallId ?? null,
  };
}

/**
 * Most recent matching job in the window, or null. Throws on lookup failure so
 * the caller can show an explicit "couldn't check" state rather than treating a
 * failure as "no duplicate".
 */
export async function findDuplicateJob(input: DuplicateJobInput): Promise<DuplicateJobMatch | null> {
  if (!canCheckDuplicate(input)) return null;
  const { data, error } = await supabase.rpc("find_duplicate_job", duplicateRpcArgs(input) as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        id: string;
        job_reference: string | null;
        job_type: string;
        address: string | null;
        customer_name: string | null;
        created_at: string;
      }
    | undefined
    | null;
  if (!row) return null;
  return {
    id: row.id,
    jobReference: row.job_reference ?? null,
    jobType: row.job_type,
    address: row.address ?? null,
    customerName: row.customer_name ?? null,
    createdAt: row.created_at,
  };
}

/** "12 minutes ago" style relative label for the warning banner. */
export function relativeSubmittedLabel(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return "recently";
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60000));
  if (mins < 1) return "less than a minute ago";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
