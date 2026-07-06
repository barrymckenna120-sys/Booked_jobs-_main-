import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  setAdminSelectedOrgId,
  setImpersonationToken,
  clearImpersonationToken,
  getImpersonationTokenState,
} from "@/integrations/supabase/orgHeaderInterceptor";

const STORAGE_KEY = "adminViewingOrgId";
const STORAGE_NAME_KEY = "adminViewingOrgName";
export const SUPER_ADMIN_EMAIL = "barrymckenna120@gmail.com";

type Ctx = {
  isSuperAdmin: boolean;
  viewingOrgId: string | null;
  viewingOrgName: string | null;
  setViewingOrg: (orgId: string | null, orgName?: string | null) => void;
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
  const [viewingOrgId, setViewingOrgIdState] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null)
  );
  const [viewingOrgName, setViewingOrgNameState] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_NAME_KEY) : null)
  );
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isSuperAdmin = email?.toLowerCase() === SUPER_ADMIN_EMAIL;

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

  const setViewingOrg = useCallback((orgId: string | null, orgName?: string | null) => {
    if (orgId) {
      localStorage.setItem(STORAGE_KEY, orgId);
      if (orgName) localStorage.setItem(STORAGE_NAME_KEY, orgName);
      setAdminSelectedOrgId(orgId);
      setViewingOrgIdState(orgId);
      setViewingOrgNameState(orgName ?? null);

      // Mint token BEFORE reloading so the first requests after reload send it.
      mintImpersonationToken(orgId).finally(() => {
        setTimeout(() => window.location.reload(), 50);
      });
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
      setTimeout(() => window.location.reload(), 50);
    }
  }, []);

  // If somehow set but user is not super-admin, clear it
  useEffect(() => {
    if (email && !isSuperAdmin && viewingOrgId) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      setAdminSelectedOrgId(null);
      clearImpersonationToken();
      setViewingOrgIdState(null);
      setViewingOrgNameState(null);
    }
  }, [email, isSuperAdmin, viewingOrgId]);

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
