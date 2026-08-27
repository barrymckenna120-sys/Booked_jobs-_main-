// I/O side of user-administration authorization.
//
// One place resolves the caller from a verified Supabase JWT, loads trusted role
// data server-side, and decides tenant-admin vs platform-admin authority.
// Individual Edge Functions must not carry their own email allowlists.

import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerToken } from "./machineAuth.ts";
import { parseOwnerAllowlist } from "./platformAdminDecision.ts";
import {
  type AdminAuthority,
  decideAdminAuthority,
  mayActOnTarget,
} from "./adminAuthDecision.ts";

export { mayActOnTarget, TENANT_ADMIN_ROLES } from "./adminAuthDecision.ts";
export type { AdminAuthority } from "./adminAuthDecision.ts";

export type AdminCaller = AdminAuthority & {
  userId: string;
  email: string | null;
  role: string | null;
  orgId: string | null;
};

export type AdminCallerResult = { error: Response } | AdminCaller;

export function isAdminDenied(r: AdminCallerResult): r is { error: Response } {
  return (r as { error?: Response }).error instanceof Response;
}

function deny(cors: Record<string, string>, status: number, fnName: string, detail: string) {
  console.warn(`${fnName}: admin authorization failed (${status}) — ${detail}`);
  return {
    error: new Response(
      JSON.stringify({ error: status === 401 ? "Unauthorized" : "Insufficient permissions" }),
      { status, headers: { ...cors, "Content-Type": "application/json" } },
    ),
  };
}

/**
 * Require an authenticated caller with at least tenant-admin authority.
 * The returned object says whether the caller ALSO has platform authority;
 * combine with `mayActOnTarget()` before touching any target row.
 */
export async function requireAdminCaller(
  req: Request,
  opts: { fnName: string; cors: Record<string, string> },
): Promise<AdminCallerResult> {
  const { fnName, cors } = opts;
  const token = bearerToken(req);
  if (!token) return deny(cors, 401, fnName, "no bearer token");

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return deny(cors, 403, fnName, "auth config unavailable (fail closed)");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user?.id) return deny(cors, 401, fnName, "invalid session");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organisation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.role as string | null) ?? null;
  const orgId = (profile?.organisation_id as string | null) ?? null;

  let ownsOrg = false;
  if (!role) {
    const { data: ownedOrg } = await supabase
      .from("organisations")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    ownsOrg = !!ownedOrg;
  }

  const authority = decideAdminAuthority(
    { email: user.email, role, ownsOrg },
    parseOwnerAllowlist(Deno.env.get("PLATFORM_OWNER_EMAILS")),
  );

  if (!authority.authorized) return deny(cors, 403, fnName, "caller is not an administrator");

  return { ...authority, userId: user.id, email: user.email ?? null, role, orgId };
}

/** Shared cross-tenant guard response for administration functions. */
export function crossTenantDenied(
  caller: AdminCaller,
  targetOrgId: string | null,
  cors: Record<string, string>,
  fnName: string,
): Response | null {
  if (mayActOnTarget(caller, caller.orgId, targetOrgId)) return null;
  console.warn(
    `${fnName}: cross-tenant action blocked — caller org ${caller.orgId ?? "none"}, target org ${targetOrgId ?? "none"}`,
  );
  return new Response(JSON.stringify({ error: "Cross-tenant action not permitted" }), {
    status: 403,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
