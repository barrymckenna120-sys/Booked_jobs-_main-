import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminViewingOrgId, SUPER_ADMIN_EMAIL } from "@/hooks/useAdminViewAs";
import { resolveEffectiveOrgId } from "@/lib/resolveEffectiveOrgId";

/**
 * Resolves the current user's organisation_id from the profiles table.
 * `ready` is false until the lookup completes (success or error), so callers
 * can gate RLS-dependent queries until auth + org are fully restored.
 */
export function useOrgId() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setReady(true);
          return;
        }
        const profileFetch = supabase
          .from("profiles")
          .select("organisation_id, role")
          .eq("user_id", session.user.id)
          .maybeSingle();

        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 8000)
        );

        const result = await Promise.race([profileFetch, timeout]);
        if (result === null) {
          console.warn("useOrgId: profile fetch timed out after 8s");
          if (!cancelled) {
            setOrgId(null);
            setReady(true);
          }
          return;
        }
        const { data: profile } = result;
        if (!cancelled) {
          setOrgId(resolveEffectiveOrgId({
            profileOrgId: (profile as any)?.organisation_id ?? null,
            profileRole: (profile as any)?.role ?? null,
            sessionEmail: session.user.email ?? null,
            viewingOrgId: getAdminViewingOrgId(),
            legacySuperAdminEmail: SUPER_ADMIN_EMAIL,
          }));
          setReady(true);
        }
      } catch (e) {
        console.error("useOrgId error:", e);
        if (!cancelled) setReady(true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { orgId, ready };
}
