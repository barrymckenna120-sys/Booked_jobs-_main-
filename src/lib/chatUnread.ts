/**
 * Internal job-chat helpers shared by the Office and Engineer chat surfaces.
 *
 * The unread badge always counts messages authored by the *other* side, so a
 * sender never inflates their own badge. `formatChatNotificationTitle` mirrors
 * the title built by the `notify_on_job_message` DB trigger — the trigger stays
 * the single writer of notification rows; this function exists so the exact
 * wording is regression-tested and can be reused if the UI ever needs to
 * re-render a title client-side.
 */
export type ChatPerspective = "office" | "engineer";

/** The role whose messages count as "unread" for the given viewer. */
export const counterpartRole = (perspective: ChatPerspective): ChatPerspective =>
  perspective === "office" ? "engineer" : "office";

export interface ChatNotificationTitleInput {
  senderName?: string | null;
  senderRole: string;
  jobReference?: string | null;
}

const roleLabel = (role: string): string =>
  role === "engineer" ? "Engineer" : "Office";

/**
 * "John Smith (Engineer) sent you a message — Job DG-100"
 * Degrades gracefully when the job reference or sender name is unavailable.
 */
export const formatChatNotificationTitle = ({
  senderName,
  senderRole,
  jobReference,
}: ChatNotificationTitleInput): string => {
  const label = roleLabel(senderRole);
  const name = senderName?.trim() || label;
  const ref = jobReference?.trim();
  const base = `${name} (${label}) sent you a message`;
  return ref ? `${base} — Job ${ref}` : base;
};
