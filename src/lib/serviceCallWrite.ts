import { supabase } from "@/integrations/supabase/client";

/**
 * Engineer-facing copy for a job write that the database refused to apply.
 * Deliberately free of any permission / database terminology.
 */
export const JOB_WRITE_BLOCKED_MESSAGE =
  "This job could not be updated. Refresh the job and try again.";

export type ServiceCallUpdateResult = {
  /** Transport / database error — retrying may succeed (offline, timeout). */
  error: any | null;
  /**
   * The request succeeded but changed ZERO rows: the row is not visible or not
   * writable for this user. Retrying will never help, so callers must surface a
   * failure and must NOT queue, log activity, or update local state.
   */
  blocked: boolean;
};

/**
 * Single writer for engineer job mutations. `.select("id")` makes the affected
 * row observable, so a row-level-filtered UPDATE (which returns no error) can
 * be distinguished from a real write.
 */
export const updateServiceCallRow = async (
  jobId: string,
  payload: Record<string, any>,
): Promise<ServiceCallUpdateResult> => {
  const { data, error } = await supabase
    .from("service_calls")
    .update(payload as any)
    .eq("id", jobId)
    .select("id");

  if (error) return { error, blocked: false };
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return { error: null, blocked: rows.length === 0 };
};
