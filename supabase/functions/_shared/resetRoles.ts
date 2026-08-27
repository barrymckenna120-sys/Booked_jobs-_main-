// Who may trigger a destructive org data reset.
//
// `get_user_role()` resolves the engineers row FIRST and only then profiles, so
// a tenant owner comes back as "owner", never "admin". Gating on
// ["admin","superadmin"] alone therefore locks out the exact people the Danger
// Zone button is rendered for. Deliberately excludes "office" and "engineer":
// they can see the account but must not be able to wipe it.
const RESET_ROLES = new Set(["admin", "superadmin", "owner", "owner_manager"]);

export function canResetOrgData(
  rpcRole: string | null | undefined,
  profileRole: string | null | undefined,
): boolean {
  const rpc = String(rpcRole ?? "");
  const profile = String(profileRole ?? "");
  return RESET_ROLES.has(rpc) || RESET_ROLES.has(profile);
}

export function isSuperadminRole(
  rpcRole: string | null | undefined,
  profileRole: string | null | undefined,
): boolean {
  return rpcRole === "superadmin" || profileRole === "superadmin";
}
