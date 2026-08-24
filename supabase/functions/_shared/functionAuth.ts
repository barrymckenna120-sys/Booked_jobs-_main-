/**
 * Minimal, additive auth guard for edge functions that were previously
 * anonymously invokable (audit finding #1).
 *
 * Deliberately accepts every credential our real callers already send, so
 * turning a guard on cannot break a live integration:
 *
 *  1. Machine callers (Make.com scenarios, internal function-to-function,
 *     pg_cron): `x-webhook-secret` or `x-make-secret` === MAKE_WEBHOOK_SECRET,
 *     or `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
 *  2. Signed-in app users: a valid Supabase user JWT in `Authorization`.
 *
 * Fails closed: anything else is 401. Never throws — callers branch on the
 * returned result.
 */

export interface FunctionAuthResult {
  ok: boolean;
  /** "machine" for secret/service-role callers, "user" for a signed-in user. */
  mode?: "machine" | "user";
  /** auth.users.id when mode === "user". */
  userId?: string;
  reason?: string;
}

function bearer(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

/** Secret/service-role check only — no network calls. */
export function isMachineCaller(req: Request): boolean {
  const expected = (Deno.env.get("MAKE_WEBHOOK_SECRET") ?? "").trim();
  if (expected) {
    const provided = (req.headers.get("x-webhook-secret") ??
      req.headers.get("x-make-secret") ?? "").trim();
    if (provided && provided === expected) return true;
  }

  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const token = bearer(req);
  if (serviceRoleKey && token && token === serviceRoleKey) return true;

  return false;
}

/**
 * Full guard: machine secret first (cheap), then a real user-JWT validation
 * against Supabase auth. The anon/publishable key is NOT accepted — it carries
 * no user, which is exactly the anonymous case we are closing.
 */
export async function authoriseRequest(req: Request): Promise<FunctionAuthResult> {
  if (isMachineCaller(req)) return { ok: true, mode: "machine" };

  const token = bearer(req);
  if (!token) return { ok: false, reason: "missing_credentials" };

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl) return { ok: false, reason: "auth_unavailable" };

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!res.ok) return { ok: false, reason: `invalid_token_${res.status}` };
    const user = await res.json();
    if (!user?.id) return { ok: false, reason: "no_user" };
    return { ok: true, mode: "user", userId: String(user.id) };
  } catch (_e) {
    return { ok: false, reason: `auth_check_failed: ${(_e as Error).message}` };
  }
}

/** Standard 401 body, with the caller's CORS headers preserved. */
export function unauthorisedResponse(
  corsHeaders: Record<string, string>,
  reason?: string,
): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", reason: reason ?? "unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
