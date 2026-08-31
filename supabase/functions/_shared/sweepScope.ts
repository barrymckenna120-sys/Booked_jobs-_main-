// Scope resolution for all-organisation "sweep" functions (cron/system jobs that
// iterate every tenant's due records, e.g. send-upcoming-reminders).
//
// BJ-0089: these functions were anonymously invokable and always swept EVERY
// organisation, so any caller could force off-schedule bulk customer sends for
// all tenants. The rules below are the authorisation model:
//
//   - Anonymous callers are rejected outright (401).
//   - A per-tenant webhook secret authenticates AND names its tenant, so such a
//     caller is pinned to that single organisation and can never sweep others.
//   - A signed-in user is pinned to their own organisation (superadmins may
//     name another organisation explicitly).
//   - ONLY an internal/system caller — the service-role key (pg_cron,
//     function-to-function) or a global cron shared secret — may sweep all
//     organisations, and even then naming an organisation_id narrows it.
//
// Kept as a pure function so the matrix is unit-testable without network access.

export type SweepScope =
  | { kind: "all" }
  | { kind: "org"; orgId: string }
  | { kind: "deny"; status: number; error: string; detail: string };

export type SweepScopeInput = {
  /** Caller presented the service-role key (pg_cron / internal invocation). */
  isServiceRole: boolean;
  /** Caller presented a global cron/Make shared secret. */
  hasGlobalSecret: boolean;
  /** Organisation owning the per-tenant webhook secret presented, if any. */
  secretOrg?: string | null;
  /** Organisation of the signed-in user, if the caller is a user. */
  userOrg?: string | null;
  /** Role of the signed-in user, if the caller is a user. */
  userRole?: string | null;
  /** organisation_id supplied in the body/query, if any. */
  requestedOrgId?: string | null;
};

export function resolveSweepScope(input: SweepScopeInput): SweepScope {
  const requested = (input.requestedOrgId ?? "").trim();
  const secretOrg = (input.secretOrg ?? "").trim();
  const userOrg = (input.userOrg ?? "").trim();

  // Per-tenant secret: pinned to its own tenant, never a global sweep.
  if (secretOrg) {
    if (requested && requested !== secretOrg) {
      return {
        kind: "deny",
        status: 403,
        error: "Forbidden",
        detail: "machine secret belongs to a different organisation",
      };
    }
    return { kind: "org", orgId: secretOrg };
  }

  // Signed-in user: pinned to their own tenant, never a global sweep.
  if (userOrg) {
    if (requested && requested !== userOrg) {
      if (input.userRole === "superadmin") return { kind: "org", orgId: requested };
      return {
        kind: "deny",
        status: 403,
        error: "Forbidden",
        detail: "requested organisation_id is not the caller's org",
      };
    }
    return { kind: "org", orgId: userOrg };
  }

  // Internal/system path — the only route to an all-tenant sweep.
  if (input.isServiceRole || input.hasGlobalSecret) {
    return requested ? { kind: "org", orgId: requested } : { kind: "all" };
  }

  return {
    kind: "deny",
    status: 401,
    error: "Unauthorized",
    detail: "no valid credentials",
  };
}
