/**
 * Which notification surface (Office App bell vs Engineer App bell) may show a row.
 * Office-scoped alerts — SumUp `payment_failed` included — must never reach the
 * Engineer App bell, even when the recipient also has engineer access.
 */
export type NotificationSurface = "engineer" | "office" | undefined;

export const surfaceRoleScope = (surface: NotificationSurface): "engineer" | null =>
  surface === "engineer" ? "engineer" : null;

export const shouldShowOnSurface = (
  role: string | null,
  surface: NotificationSurface,
): boolean => {
  const scope = surfaceRoleScope(surface);
  if (!scope) return true;
  return role === scope;
};
