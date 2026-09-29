/**
 * An existing login whose profile belongs to a different organisation must not
 * be linked to an engineer row in the target organisation: RLS scopes reads by
 * the profile's organisation, so the new row would be invisible to that login
 * and role resolution would silently fall back to "engineer".
 */
export function isCrossOrgInviteConflict(
  existingProfileOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
): boolean {
  return !!existingProfileOrgId && !!targetOrgId && existingProfileOrgId !== targetOrgId;
}
