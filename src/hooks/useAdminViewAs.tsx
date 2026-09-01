import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  setAdminSelectedOrgId,
  setImpersonationToken,
  clearImpersonationToken,
  getImpersonationTokenState,
} from "@/integrations/supabase/orgHeaderInterceptor";
import { fetchProfile, clearProfileCache } from "@/lib/profileCache";


const STORAGE_KEY = "adminViewingOrgId";
const STORAGE_NAME_KEY = "adminViewingOrgName";
export const SUPER_ADMIN_EMAIL = "barrymckenna120@gmail.com";

type Ctx = {
  isSuperAdmin: boolean;
  viewingOrgId: string | null;
  viewingOrgName: string | null;
  setViewingOrg: (orgId: string | null, orgName?: string | null) => void | Promise<void>;
};

const AdminViewAsContext = createContext<Ctx>({
  isSuperAdmin: false,
  viewingOrgId: null,
  viewingOrgName: null,
  setViewingOrg: () => {},
});

async function mintImpersonationToken(orgId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("impersonate-org", {
      body: { org_id: orgId },
    });
    if (error || !data?.token || !data?.exp) {
      console.error("[impersonate-org] mint failed", error);
      return false;
    }
    setImpersonationToken(orgId, data.token as string, data.exp as number);
    return true;
  } catch (e) {
    console.error("[impersonate-org] mint threw", e);
    return false;
  }
}

export const AdminViewAsProvider = ({ children }: { children: ReactNode }) => {
  const [email, setEmail] = useState<string | null>(null);
  const [isSuperAdminRole, setIsSuperAdminRole] = useState(false);
  // Until we've resolved the role server-side we must not clear an existing
  // selection, otherwise a refresh would silently drop the impersonation.
  const [roleResolved, setRoleResolved] = useState(false);
  const [viewingOrgId, setViewingOrgIdState] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null)
  );
  const [viewingOrgName, setViewingOrgNameState] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_NAME_KEY) : null)
  );
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Source of truth for super-admin: profiles.role, exactly what the
    // impersonate-org edge function trusts server-side.
    const resolve = async (userId: string | null | undefined) => {
      if (!userId) {
        if (!cancelled) {
          setIsSuperAdminRole(false);
          setRoleResolved(true);
        }
        return;
      }
      const profile = await fetchProfile(userId);
      if (!cancelled) {
        setIsSuperAdminRole(profile?.role === "superadmin");
        setRoleResolved(true);
      }

    };

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? null);
      resolve(data.user?.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      setRoleResolved(false);
      resolve(session?.user?.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Role is the primary check; the hardcoded email stays as an extra allowance.
  const isSuperAdmin = isSuperAdminRole || email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const scheduleRefresh = useCallback((orgId: string) => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    const { exp } = getImpersonationTokenState();
    const now = Math.floor(Date.now() / 1000);
    // Refresh 2 minutes before expiry (min 10s from now)
    const secondsUntilRefresh = Math.max(10, exp - now - 120);
    refreshTimer.current = window.setTimeout(async () => {
      const ok = await mintImpersonationToken(orgId);
      if (ok) scheduleRefresh(orgId);
    }, secondsUntilRefresh * 1000);
  }, []);

  const setViewingOrg = useCallback(async (orgId: string | null, orgName?: string | null) => {
    if (orgId) {
      // Clear job cache for the previous org to prevent cross-tenant leak
      localStorage.removeItem("bookedjobs_jobs_cache_" +
        (localStorage.getItem(STORAGE_KEY) || "default"));
      localStorage.removeItem("bookedjobs_engineer_jobs_cache");
      localStorage.removeItem("bookedjobs_customers_cache");

      localStorage.setItem(STORAGE_KEY, orgId);
      if (orgName) localStorage.setItem(STORAGE_NAME_KEY, orgName);
      setAdminSelectedOrgId(orgId);
      setViewingOrgIdState(orgId);
      setViewingOrgNameState(orgName ?? null);

      // Await the mint so the first requests after reload always send the token.
      await mintImpersonationToken(orgId);
      window.location.reload();
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      setAdminSelectedOrgId(null);
      clearImpersonationToken();
      setViewingOrgIdState(null);
      setViewingOrgNameState(null);
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      window.location.reload();
    }
  }, []);


  // If somehow set but user is not super-admin, clear it. Only once the role
  // has actually been resolved, so we never clear a valid selection early.
  useEffect(() => {
    if (roleResolved && !isSuperAdmin && viewingOrgId) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      setAdminSelectedOrgId(null);
      clearImpersonationToken();
      setViewingOrgIdState(null);
      setViewingOrgNameState(null);
    }
  }, [roleResolved, isSuperAdmin, viewingOrgId]);

  // On mount / when viewing org changes, ensure we have a valid token and
  // schedule auto-refresh.
  useEffect(() => {
    if (!isSuperAdmin || !viewingOrgId) return;
    const { token, exp, org } = getImpersonationTokenState();
    const now = Math.floor(Date.now() / 1000);
    const isStale = !token || org !== viewingOrgId || exp - now < 60;
    if (isStale) {
      mintImpersonationToken(viewingOrgId).then((ok) => {
        if (ok) scheduleRefresh(viewingOrgId);
      });
    } else {
      scheduleRefresh(viewingOrgId);
    }
    return () => {
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [isSuperAdmin, viewingOrgId, scheduleRefresh]);

  const value = useMemo(
    () => ({
      isSuperAdmin,
      viewingOrgId: isSuperAdmin ? viewingOrgId : null,
      viewingOrgName: isSuperAdmin ? viewingOrgName : null,
      setViewingOrg,
    }),
    [isSuperAdmin, viewingOrgId, viewingOrgName, setViewingOrg]
  );

  return <AdminViewAsContext.Provider value={value}>{children}</AdminViewAsContext.Provider>;
};

export const useAdminViewAs = () => useContext(AdminViewAsContext);

/** Read-only helper for non-React modules (returns the override or null). */
export const getAdminViewingOrgId = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
};
