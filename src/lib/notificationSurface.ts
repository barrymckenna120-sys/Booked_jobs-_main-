/**
 * Which notification surface (Office App bell vs Engineer App bell) may show a row.
 *
 * - Engineer App: only `role = 'engineer'` rows. Office-scoped alerts — SumUp
 *   `payment_failed` included — must never reach the Engineer App bell.
 * - Office App: everything except `role = 'engineer'` rows. Users who are both
 *   office staff and engineers receive an engineer-scoped copy of job events;
 *   counting those on the Office bell buried office alerts (e.g. a
 *   `quote_accepted` row) behind a saturated "99+" badge and pushed them out of
 *   the 50-row drawer window. Rows with no role stay visible on Office.
 */
export type NotificationSurface = "engineer" | "office" | undefined;

export const surfaceRoleScope = (surface: NotificationSurface): "engineer" | null =>
  surface === "engineer" ? "engineer" : null;

export const shouldShowOnSurface = (
  role: string | null,
  surface: NotificationSurface,
): boolean => {
  if (surface === "engineer") return role === "engineer";
  if (surface === "office") return role !== "engineer";
  return true;
};
