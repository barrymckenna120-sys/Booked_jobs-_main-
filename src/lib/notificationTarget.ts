/**
 * Resolves the in-app route a notification should open when tapped.
 *
 * Parts notifications (`parts_cancelled`, `parts_update`, `parts_requested`) carry the
 * `parts_request_id` in metadata, so they deep-link to the relevant parts list
 * with that row highlighted instead of dumping the user on the general job page.
 * Everything else keeps the existing job-page behaviour.
 */
export interface NotificationTargetInput {
  notification_type: string;
  job_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

const PARTS_TYPES = new Set(["parts_cancelled", "parts_update", "parts_requested"]);

export const resolveNotificationTarget = (
  n: NotificationTargetInput,
  jobPathPrefix = "/jobs",
): string | null => {
  const isEngineerSurface = jobPathPrefix.startsWith("/engineer");

  if (PARTS_TYPES.has(n.notification_type)) {
    const partId = n.metadata?.parts_request_id;
    const base = isEngineerSurface ? "/engineer/parts" : "/parts";
    if (typeof partId === "string" && partId.length > 0) {
      return `${base}?highlight=${encodeURIComponent(partId)}`;
    }
    return base;
  }

  if (n.job_id) return `${jobPathPrefix}/${n.job_id}`;
  return null;
};
