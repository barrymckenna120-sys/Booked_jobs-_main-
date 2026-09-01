// NOTE: profiles.last_login (text column) exists but is unused/superseded by
// auth.users.last_sign_in_at (surfaced via the list-users edge function). Do
// not read or write profiles.last_login — it is not live data.
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { withRequestTimeout } from "@/lib/queryDefaults";

export type AppRole = "admin" | "office" | "engineer";

/**
 * Returns the current user's role by checking if their auth ID
 * is linked to an engineer record. A signed-in user with no engineer row
 * falls back to "engineer" (not "admin"); the "admin" initial state below
 * only applies before resolution completes, while `loading` is true.
 */
export const useUserRole = (user: User | null) => {
  const [role, setRole] = useState<AppRole>("admin");
  const [engineerId, setEngineerId] = useState<string | null>(null);
  const [engineerName, setEngineerName] = useState<string | null>(null);
  const [canAccessOffice, setCanAccessOffice] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Depend on user?.id rather than the full user object so token-refresh
  // events don't re-run role resolution (same guard as useNotifications).
  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setRole("admin");
      setEngineerId(null);
      setEngineerName(null);
      setCanAccessOffice(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fail-safe used when the lookup errors or hangs past the request
    // timeout: match the documented "no engineer row" fallback so
    // `loading` can never stay true indefinitely and the office gate
    // resolves to the least-privileged role.
    const applyEngineerFallback = () => {
      setRole("engineer");
      setEngineerId(null);
      setEngineerName(null);
      setCanAccessOffice(false);
    };

    (async () => {
      try {
        // 1) Check profiles first for superadmin short-circuit
        const { data: profile } = await withRequestTimeout(
          supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle()
        );

        if (cancelled) return;

        if ((profile as any)?.role === "superadmin") {
          setRole("admin");
          setEngineerId(null);
          setEngineerName(null);
          setCanAccessOffice(true);
          return;
        }

        // 2) Fall through to existing engineers lookup
        const { data } = await withRequestTimeout(
          supabase.from("engineers").select("*").eq("auth_user_id", userId).maybeSingle()
        );

        console.log("useUserRole data:", data);
        if (cancelled) return;
        const engineerRow: any = data;
        if (engineerRow) {
          const rawRole = (engineerRow.role as string) || "engineer";
          setRole(rawRole as AppRole);
          setEngineerId(engineerRow.id);
          setEngineerName(engineerRow.name);
          // Owner/manager/admin/office roles always get office access,
          // regardless of the can_access_office flag on the engineer row.
          const elevated = ["owner", "manager", "admin", "office"].includes(rawRole);
          setCanAccessOffice(elevated || !!engineerRow?.can_access_office);
        } else {
          applyEngineerFallback();
        }
      } catch (err) {
        console.warn("[useUserRole] role lookup failed or timed out:", err);
        if (cancelled) return;
        applyEngineerFallback();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isEngineer = role === "engineer";
  const isAdmin = role === "admin";
  const isOffice = role === "office";

  return { role, isEngineer, isAdmin, isOffice, engineerId, engineerName, canAccessOffice, loading };
};

