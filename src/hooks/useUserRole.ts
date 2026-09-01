// NOTE: profiles.last_login (text column) exists but is unused/superseded by
// auth.users.last_sign_in_at (surfaced via the list-users edge function). Do
// not read or write profiles.last_login — it is not live data.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { withRequestTimeout } from "@/lib/queryDefaults";

export type AppRole = "admin" | "office" | "engineer";

interface ResolvedRole {
  role: AppRole;
  engineerId: string | null;
  engineerName: string | null;
  canAccessOffice: boolean;
}

/**
 * Fail-safe used when the lookup errors or hangs past the request timeout:
 * matches the documented "no engineer row" fallback so the office gate always
 * resolves to the least-privileged role instead of staying pending.
 */
const ENGINEER_FALLBACK: ResolvedRole = {
  role: "engineer",
  engineerId: null,
  engineerName: null,
  canAccessOffice: false,
};

/** Signed-out shape — preserves the previous hook's initial "admin" default. */
const SIGNED_OUT: ResolvedRole = {
  role: "admin",
  engineerId: null,
  engineerName: null,
  canAccessOffice: false,
};

const resolveRole = async (userId: string): Promise<ResolvedRole> => {
  try {
    // 1) Check profiles first for superadmin short-circuit
    const { data: profile } = await withRequestTimeout(
      supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle()
    );

    if ((profile as any)?.role === "superadmin") {
      return { role: "admin", engineerId: null, engineerName: null, canAccessOffice: true };
    }

    // 2) Fall through to the engineers lookup
    const { data } = await withRequestTimeout(
      supabase.from("engineers").select("*").eq("auth_user_id", userId).maybeSingle()
    );

    const engineerRow: any = data;
    if (!engineerRow) return ENGINEER_FALLBACK;

    const rawRole = (engineerRow.role as string) || "engineer";
    // Owner/manager/admin/office roles always get office access, regardless of
    // the can_access_office flag on the engineer row.
    const elevated = ["owner", "manager", "admin", "office"].includes(rawRole);
    return {
      role: rawRole as AppRole,
      engineerId: engineerRow.id,
      engineerName: engineerRow.name,
      canAccessOffice: elevated || !!engineerRow?.can_access_office,
    };
  } catch (err) {
    console.warn("[useUserRole] role lookup failed or timed out:", err);
    return ENGINEER_FALLBACK;
  }
};

/**
 * Returns the current user's role by checking if their auth ID is linked to an
 * engineer record. A signed-in user with no engineer row falls back to
 * "engineer" (not "admin"); the "admin" default only applies while signed out
 * or before resolution completes, while `loading` is true.
 *
 * Resolution is a single shared cached query per session, so the ~25 call sites
 * across layouts, guards and pages all read the same already-resolved answer
 * instead of each running its own lookup with its own loading window.
 */
export const useUserRole = (user: User | null) => {
  const userId = user?.id;

  const { data, isPending } = useQuery({
    queryKey: ["user-role", userId],
    queryFn: () => resolveRole(userId!),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const resolved = data ?? SIGNED_OUT;
  const loading = !!userId && isPending;

  return {
    role: resolved.role,
    isEngineer: resolved.role === "engineer",
    isAdmin: resolved.role === "admin",
    isOffice: resolved.role === "office",
    engineerId: resolved.engineerId,
    engineerName: resolved.engineerName,
    canAccessOffice: resolved.canAccessOffice,
    loading,
  };
};
