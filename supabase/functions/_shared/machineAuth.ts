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

export function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

export function isMachineCaller(req: Request): boolean {
  const provided = (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-make-secret") ??
    ""
  ).trim();

  const expectedSecrets = [
    Deno.env.get("WEBHOOK_SHARED_SECRET"),
    Deno.env.get("MAKE_WEBHOOK_SECRET"),
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  if (provided && expectedSecrets.includes(provided)) return true;

  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const token = bearerToken(req);
  return Boolean(serviceRoleKey && token && token === serviceRoleKey);
}

/**
 * Machine callers only (cron / Make.com). Signed-in user JWTs are rejected.
 */
export function requireMachineCaller(
  req: Request,
  corsHeaders: Record<string, string>,
  fnName: string,
): Response | null {
  if (isMachineCaller(req)) return null;
  console.warn(`${fnName}: rejected unauthorised caller (no machine credentials)`);
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
  if (isMachineCaller(req)) return null;

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
