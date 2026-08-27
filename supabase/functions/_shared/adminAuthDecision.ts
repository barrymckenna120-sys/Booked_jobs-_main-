// Pure authorization decision for user-administration Edge Functions.
//
// Separates the two authorities that used to be tangled together (and duplicated
// as per-function hardcoded email allowlists):
//
//   tenant admin      -> may act on users INSIDE their own organisation only
//   platform admin    -> may act across tenants (superadmin role, or the single
//                        centrally configured platform-owner override)
//
// No Deno/npm imports here so it can be unit-tested from the app test runner.

import { decidePlatformAdmin } from "./platformAdminDecision.ts";

/** Tenant roles intentionally allowed to administer users in their own org. */
export const TENANT_ADMIN_ROLES = ["admin", "office", "owner", "manager"] as const;

export type AdminIdentity = {
  email?: string | null;
  /** profiles.role, read server-side. Never client-supplied. */
  role?: string | null;
  /** True when the caller is the owner_user_id of an organisation. */
  ownsOrg?: boolean;
};

export type AdminAuthority = {
  platformAdmin: boolean;
  tenantAdmin: boolean;
  /** True when either authority applies. */
  authorized: boolean;
  via: "role" | "platform_owner_env" | "tenant_role" | "org_owner" | null;
};

export function decideAdminAuthority(
  identity: AdminIdentity,
  ownerAllowlist: string[],
): AdminAuthority {
  const platform = decidePlatformAdmin(
    { email: identity.email, role: identity.role },
    ownerAllowlist,
  );
  if (platform.allowed) {
    return {
      platformAdmin: true,
      tenantAdmin: true,
      authorized: true,
      via: platform.via ?? "role",
    };
  }

  const role = String(identity.role ?? "").trim().toLowerCase();
  if ((TENANT_ADMIN_ROLES as readonly string[]).includes(role)) {
    return { platformAdmin: false, tenantAdmin: true, authorized: true, via: "tenant_role" };
  }
  if (identity.ownsOrg === true) {
    return { platformAdmin: false, tenantAdmin: true, authorized: true, via: "org_owner" };
  }
  return { platformAdmin: false, tenantAdmin: false, authorized: false, via: null };
}

/**
 * Same-organisation check for tenant admins. Fails closed on either side being
 * unknown; platform admins are the only callers allowed to cross tenants.
 */
export function mayActOnTarget(
  authority: Pick<AdminAuthority, "platformAdmin" | "tenantAdmin">,
  callerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
): boolean {
  if (authority.platformAdmin) return true;
  if (!authority.tenantAdmin) return false;
  if (!callerOrgId || !targetOrgId) return false;
  return callerOrgId === targetOrgId;
}
