import { supabase } from "@/integrations/supabase/client";
import { withRequestTimeout } from "@/lib/queryDefaults";

/**
 * Determine the correct post-login landing path for a user.
 * Shared by Auth.tsx (post-login redirect) and RootRoute (gating "/").
 * Keep this the single source of truth — do not inline this logic elsewhere.
 */
export async function resolveLandingPath(userId: string): Promise<string> {
  const { data: engineerRow } = await supabase
    .from("engineers")
    .select("role, can_access_office")
    .eq("auth_user_id", userId)
    .maybeSingle();
  const role = (engineerRow as any)?.role;
  const canOffice = !!(engineerRow as any)?.can_access_office;
  const elevated = ["owner", "manager", "admin", "office"].includes(role);
  if (role === "engineer" && !canOffice && !elevated) {
    return "/engineer/today";
  }
  return "/dashboard";
}

/**
 * Least-privileged destination used when the lookup cannot be answered. Mirrors
 * the ENGINEER_FALLBACK semantics in useUserRole: the engineer screens are the
 * safe default, and the route/RLS guards remain the actual authority.
 */
export const LANDING_FALLBACK_PATH = "/engineer/today";

/**
 * Always resolves. The unbounded lookup was the one startup step that could
 * hang permanently: on "/" (the installed app's start_url) a stalled cellular
 * connection left the brand loader on screen with no destination ever chosen,
 * no error and no retry — the reported "stuck on Loading..." failure.
 */
export async function resolveLandingPathSafe(
  userId: string,
  resolver: (id: string) => Promise<string> = resolveLandingPath,
  timeoutMs?: number
): Promise<string> {
  try {
    return await withRequestTimeout(resolver(userId), timeoutMs);
  } catch (error) {
    console.warn("[landing] path lookup failed or timed out:", error);
    return LANDING_FALLBACK_PATH;
  }
}
