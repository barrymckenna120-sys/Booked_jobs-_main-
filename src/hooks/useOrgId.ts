import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminViewingOrgId, SUPER_ADMIN_EMAIL } from "@/hooks/useAdminViewAs";

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
        // Super-admin "View as Tenant" override
        const override = getAdminViewingOrgId();
        if (override && session.user.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
          if (!cancelled) {
            setOrgId(override);
            setReady(true);
          }
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("organisation_id")
          .eq("id", session.user.id)
          .maybeSingle();
        if (!cancelled) {
          setOrgId((profile as any)?.organisation_id ?? null);
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
