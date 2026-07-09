import { supabase } from "@/integrations/supabase/client";

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
