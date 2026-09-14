/**
 * Storage path for a tenant's business logo.
 *
 * The `business-logos` storage policies require the first folder of the object
 * name to equal the caller's organisation id (`get_my_org_id()`), so the path
 * must be org-scoped — a user-scoped folder is rejected as a policy violation.
 */
export const buildLogoStoragePath = (
  organisationId: string | null | undefined,
  ext: string | undefined
): string => {
  if (!organisationId) {
    throw new Error("Could not resolve your organisation. Please refresh and try again.");
  }
  const safeExt = (ext || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `${organisationId}/logo.${safeExt}`;
};
