import { supabase } from "@/integrations/supabase/client";

/**
 * Wrapper around supabase.functions.invoke that recovers from stale sessions.
 *
 * A locally-cached access token can still be well-formed after its server-side
 * session has been revoked (GoTrue: "Session from session_id claim in JWT does
 * not exist"). Edge functions then correctly reject it with 401. When that
 * happens we refresh the session once and retry; if the refresh fails the user
 * is signed out so the app routes back to the login screen instead of showing
 * a blank page.
 */
export async function invokeFunction<T = any>(
  name: string,
  options?: { body?: unknown; signOutOnRefreshFailure?: boolean },
) {
  const { signOutOnRefreshFailure = true, ...invokeOptions } = options ?? {};
  const first = await supabase.functions.invoke<T>(name, invokeOptions as any);
  const ctx = (first.error as any)?.context;
  // FunctionsHttpError puts the Response on `context` itself; older/other
  // shapes nest it under `context.response`.
  const status = ctx?.status ?? ctx?.response?.status;
  if (!first.error || status !== 401) return first;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed?.session) {
    // Background/fire-and-forget calls opt out: a failed receipt send must not
    // eject the engineer mid-completion.
    if (signOutOnRefreshFailure) await supabase.auth.signOut();
    return first;
  }

  return await supabase.functions.invoke<T>(name, invokeOptions as any);
}

