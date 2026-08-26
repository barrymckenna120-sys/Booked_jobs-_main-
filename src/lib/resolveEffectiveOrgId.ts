type ResolveEffectiveOrgIdInput = {
  profileOrgId?: string | null;
  profileRole?: string | null;
  sessionEmail?: string | null;
  viewingOrgId?: string | null;
  legacySuperAdminEmail?: string;
};

export function resolveEffectiveOrgId({
  profileOrgId,
  profileRole,
  sessionEmail,
  viewingOrgId,
  legacySuperAdminEmail,
}: ResolveEffectiveOrgIdInput): string | null {
  const isServerSuperAdmin = profileRole === "superadmin";
  const isLegacySuperAdmin =
    !!legacySuperAdminEmail &&
    !!sessionEmail &&
    sessionEmail.toLowerCase() === legacySuperAdminEmail.toLowerCase();

  if (viewingOrgId && (isServerSuperAdmin || isLegacySuperAdmin)) {
    return viewingOrgId;
  }

  return profileOrgId ?? null;
}