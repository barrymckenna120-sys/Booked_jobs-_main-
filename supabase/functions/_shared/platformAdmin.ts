// One implementation of platform-owner / superadmin authorization.
//
// Replaces the hardcoded email allowlists that were copy-pasted into
// admin-set-password, list-tenants, unblock-user, list-users, notify-failed-login
// and friends. Those drifted apart and could not be rotated.
//
// Order of authority:
//   1. `profiles.role = 'superadmin'` read server-side with the service role.
//   2. An OPTIONAL platform-owner override loaded from ONE place:
//      the `PLATFORM_OWNER_EMAILS` env var (comma separated). Emails are
//      trimmed + lowercased before comparison and are read from the verified
//      JWT identity, never from the request body.
//
// Fails closed: no session, unreadable profile, or missing config => denied.

import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerToken } from "./machineAuth.ts";
import { decidePlatformAdmin, parseOwnerAllowlist } from "./platformAdminDecision.ts";

export type PlatformAdmin = {
  userId: string;
  email: string | null;
  role: string | null;
  orgId: string | null;
  via: "role" | "platform_owner_env";
};

export type PlatformAdminResult = { error: Response } | PlatformAdmin;

export function isPlatformAdminDenied(r: PlatformAdminResult): r is { error: Response } {
  return (r as { error?: Response }).error instanceof Response;
}

/** Parse the single controlled platform-owner allowlist. Pure/unit-testable. */
export {
  decidePlatformAdmin,
  parseOwnerAllowlist,
} from "./platformAdminDecision.ts";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function deny(cors: Record<string, string>, status: number, fnName: string, detail: string) {
  console.warn(`${fnName}: platform-admin check failed (${status}) — ${detail}`);
  return {
    error: new Response(
      JSON.stringify({ error: status === 401 ? "Unauthorized" : "Forbidden" }),
      { status, headers: { ...cors, "Content-Type": "application/json" } },
    ),
  };
}

/**
 * Verify the caller's JWT and require platform-admin authority.
 * Returns the trusted identity (never anything client-supplied).
 */
export async function requirePlatformAdmin(
  req: Request,
  opts: { fnName: string; cors: Record<string, string> },
): Promise<PlatformAdminResult> {
  const { fnName, cors } = opts;
  const token = bearerToken(req);
  if (!token) return deny(cors, 401, fnName, "no bearer token");

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return deny(cors, 403, fnName, "auth config unavailable (fail closed)");

  const supabase = serviceClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user?.id) return deny(cors, 401, fnName, "invalid session");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organisation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const decision = decidePlatformAdmin(
    { email: user.email, role: (profile?.role as string | null) ?? null },
    parseOwnerAllowlist(Deno.env.get("PLATFORM_OWNER_EMAILS")),
  );
  if (!decision.allowed) return deny(cors, 403, fnName, "caller is not a platform admin");

  return {
    userId: user.id,
    email: user.email ?? null,
    role: (profile?.role as string | null) ?? null,
    orgId: (profile?.organisation_id as string | null) ?? null,
    via: decision.via!,
  };
}

/**
 * Is this (already verified) email address in the single central platform-owner
 * allowlist? Use ONLY as an additive platform-authority check alongside
 * `profiles.role = 'superadmin'`; never as a substitute for tenant-role
 * authorization, and never with an email taken from a request body.
 */
export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return parseOwnerAllowlist(Deno.env.get("PLATFORM_OWNER_EMAILS")).includes(normalized);
}
