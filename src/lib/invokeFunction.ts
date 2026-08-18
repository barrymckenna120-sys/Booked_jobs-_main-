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
  options?: { body?: unknown },
) {
  const first = await supabase.functions.invoke<T>(name, options as any);
  const status = (first.error as any)?.context?.response?.status;
  if (!first.error || status !== 401) return first;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed?.session) {
    await supabase.auth.signOut();
    return first;
  }

  return await supabase.functions.invoke<T>(name, options as any);
}
