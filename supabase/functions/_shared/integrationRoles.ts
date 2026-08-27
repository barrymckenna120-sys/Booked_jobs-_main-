const INTEGRATION_MANAGER_ROLES = new Set([
  "admin",
  "superadmin",
  "office",
  "owner",
  "owner_manager",
]);

export function canManageTenantIntegration(
  rpcRole: string | null | undefined,
  profileRole: string | null | undefined,
): boolean {
  const rpc = String(rpcRole ?? "");
  const profile = String(profileRole ?? "");
  return INTEGRATION_MANAGER_ROLES.has(rpc) || INTEGRATION_MANAGER_ROLES.has(profile);
}
