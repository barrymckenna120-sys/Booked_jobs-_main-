// Shared machine-to-machine auth gate for cron/webhook-invoked Edge Functions.
//
// Mirrors the pattern already proven in get-upcoming-jobs / get-tomorrows-jobs /
// missed-call-lookup so there is exactly ONE implementation of this check.
//
// Accepted credentials:
//   - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — what pg_cron sends.
//   - `x-webhook-secret` / `x-make-secret` === MAKE_WEBHOOK_SECRET
//     (or WEBHOOK_SHARED_SECRET when that alias is provisioned).
// Everything else must be rejected with HTTP 401 by the caller.

import { createClient } from "npm:@supabase/supabase-js@2";
import { orgForSecret, type TenantIntegrationRow } from "./tenantSecret.ts";

export function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

/** The raw machine secret header value, if any. */
export function providedSecret(req: Request): string {
  return (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-make-secret") ??
    ""
  ).trim();
}

/**
 * The organisation a presented per-tenant webhook secret belongs to.
 *
 * This is the credential Make.com scenarios should use: it authenticates the
 * caller AND names the tenant, so no body-supplied organisation_id can widen
 * scope. Returns null when the secret is absent, unknown, or ambiguous.
 */
export async function tenantSecretOrg(req: Request): Promise<string | null> {
  const provided = providedSecret(req);
  if (!provided) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase
      .from("tenant_integrations")
      .select("organisation_id, config");
    return orgForSecret((data ?? []) as TenantIntegrationRow[], provided);
  } catch (_e) {
    return null;
  }
}


/** Header shared-secret check only — synchronous, no network. */
export function hasSharedSecret(req: Request): boolean {
  const provided = (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-make-secret") ??
    ""
  ).trim();

  const expectedSecrets = [
    Deno.env.get("WEBHOOK_SHARED_SECRET"),
    Deno.env.get("MAKE_WEBHOOK_SECRET"),
    // Used by pg_cron: the scheduler cannot present a service-role key, so it
    // sends this shared secret in x-webhook-secret instead.
    Deno.env.get("CRON_SHARED_SECRET"),
  ]

    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  return Boolean(provided && expectedSecrets.includes(provided));
}

/**
 * True when the caller presents a service-role credential.
 *
 * Byte-equality against SUPABASE_SERVICE_ROLE_KEY is the fast path, but it is
 * not sufficient: pg_cron jobs carry a service-role key issued separately (e.g.
 * from vault) which is equally valid yet not the same string. So we fall back to
 * proving the token actually holds service-role privilege by calling an
 * admin-only endpoint with it. An anon/publishable key or a user JWT fails that.
 */
export async function isServiceRoleToken(token: string): Promise<boolean> {
  if (!token) return false;

  const envKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (envKey && token === envKey) return true;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) return false;

  try {
    const probe = createClient(supabaseUrl, token, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch (_e) {
    return false;
  }
}

export async function isMachineCaller(req: Request): Promise<boolean> {
  if (hasSharedSecret(req)) return true;
  // A per-tenant webhook secret is a first-class machine credential.
  if (await tenantSecretOrg(req)) return true;
  return await isServiceRoleToken(bearerToken(req));
}


/**
 * Machine callers only (cron / Make.com). Signed-in user JWTs are rejected.
 */
export async function requireMachineCaller(
  req: Request,
  corsHeaders: Record<string, string>,
  fnName: string,
): Promise<Response | null> {
  if (await isMachineCaller(req)) return null;
  console.warn(
    `${fnName}: rejected unauthorised caller (no machine credentials; ` +
      `shared_secret=${hasSharedSecret(req)} bearer_present=${Boolean(bearerToken(req))})`,
  );
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}



/**
 * Machine callers OR a valid signed-in Supabase user JWT. Use for functions the
 * app itself invokes (e.g. a manual "send now" button) as well as cron.
 * The anon/publishable key alone is rejected.
 */
export async function requireMachineOrUser(
  req: Request,
  corsHeaders: Record<string, string>,
  fnName: string,
): Promise<Response | null> {
  if (await isMachineCaller(req)) return null;

  const token = bearerToken(req);
  let reason = "missing_credentials";

  if (token) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      reason = "auth_unavailable";
    } else {
      try {
        const authClient = createClient(supabaseUrl, serviceKey);
        const { data, error } = await authClient.auth.getUser(token);
        if (!error && data?.user?.id) return null;
        reason = "invalid_token";
      } catch (_e) {
        reason = `auth_check_failed: ${(_e as Error).message}`;
      }
    }
  }

  console.warn(`${fnName}: rejected unauthorised caller (${reason})`);
  return new Response(JSON.stringify({ error: "Unauthorized", reason }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Same accepted callers as requireMachineOrUser, but tells the caller WHICH
 * identity was presented so a function can apply user-only tenant scoping.
 * Returns null when the request is unauthorised (caller must return 401).
 */
export async function resolveCaller(
  req: Request,
): Promise<{ kind: "machine" } | { kind: "user"; userId: string } | null> {
  if (await isMachineCaller(req)) return { kind: "machine" };

  const token = bearerToken(req);
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const authClient = createClient(supabaseUrl, serviceKey);
    const { data, error } = await authClient.auth.getUser(token);
    if (!error && data?.user?.id) return { kind: "user", userId: data.user.id };
  } catch (_e) {
    return null;
  }
  return null;
}

