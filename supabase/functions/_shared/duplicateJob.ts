/**
 * BJ-0131a — job-level duplicate detection (Edge Function side).
 *
 * The canonical matching implementation lives in the database function
 * `public.find_duplicate_job(...)`: organisation scoping, phone normalisation
 * (mirror of `normalisePhoneE164`), exact job_type equality, trimmed literal
 * address equality, the rolling window and self-exclusion are all enforced
 * there. This module is only a thin, typed call site so the two Tally handlers
 * and the frontend share one contract instead of three algorithms.
 *
 * Advisory feature: every failure is logged and swallowed. A duplicate check
 * must never fail a customer's submission.
 */
import { normalisePhoneE164 } from "./phone.ts";

export type DuplicateJobMatch = {
  id: string;
  jobReference: string | null;
  jobType: string;
  address: string | null;
  customerName: string | null;
  createdAt: string;
};

export type FindDuplicateJobInput = {
  organisationId: string;
  phone: string;
  jobType: string;
  address: string;
  windowMinutes?: number;
  excludeServiceCallId?: string;
};

/** Returns the most recent matching job, or null. Never throws. */
export async function findDuplicateJob(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: FindDuplicateJobInput,
  logLabel = "duplicate-job",
): Promise<DuplicateJobMatch | null> {
  const phone = normalisePhoneE164(input.phone);
  const address = (input.address ?? "").trim();
  if (!input.organisationId || !phone || !input.jobType || !address) return null;

  try {
    const { data, error } = await supabase.rpc("find_duplicate_job", {
      p_organisation_id: input.organisationId,
      p_phone: phone,
      p_job_type: input.jobType,
      p_address: address,
      p_window_minutes: input.windowMinutes ?? 60,
      p_exclude_service_call_id: input.excludeServiceCallId ?? null,
    });
    if (error) {
      console.error(`[${logLabel}] duplicate lookup failed:`, error.message ?? error);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      jobReference: row.job_reference ?? null,
      jobType: row.job_type,
      address: row.address ?? null,
      customerName: row.customer_name ?? null,
      createdAt: row.created_at,
    };
  } catch (_e) {
    console.error(`[${logLabel}] duplicate lookup threw:`, (_e as Error)?.message ?? _e);
    return null;
  }
}

/**
 * Post-insert flagging used by the Tally handlers. Flags ONLY the newly
 * inserted row; the matched/original job is never touched. Non-blocking.
 */
export async function flagDuplicateJob(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  newServiceCallId: string,
  input: Omit<FindDuplicateJobInput, "excludeServiceCallId">,
  logLabel = "duplicate-job",
): Promise<DuplicateJobMatch | null> {
  const match = await findDuplicateJob(
    supabase,
    { ...input, excludeServiceCallId: newServiceCallId },
    logLabel,
  );
  if (!match) return null;
  try {
    const { error } = await supabase
      .from("service_calls")
      .update({ possible_duplicate: true, matched_job_id: match.id })
      .eq("id", newServiceCallId)
      .eq("organisation_id", input.organisationId);
    if (error) {
      console.error(`[${logLabel}] duplicate flag update failed:`, error.message ?? error);
    }
  } catch (_e) {
    console.error(`[${logLabel}] duplicate flag update threw:`, (_e as Error)?.message ?? _e);
  }
  return match;
}
