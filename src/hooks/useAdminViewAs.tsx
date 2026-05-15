import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export const AdminViewAsProvider = ({ children }: { children: ReactNode }) => {
  const [email, setEmail] = useState<string | null>(null);
  const [viewingOrgId, setViewingOrgIdState] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null)
  );
  const [viewingOrgName, setViewingOrgNameState] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_NAME_KEY) : null)
  );

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

  const setViewingOrg = useCallback((orgId: string | null, orgName?: string | null) => {
    if (orgId) {
      localStorage.setItem(STORAGE_KEY, orgId);
      if (orgName) localStorage.setItem(STORAGE_NAME_KEY, orgName);
      setViewingOrgIdState(orgId);
      setViewingOrgNameState(orgName ?? null);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      setViewingOrgIdState(null);
      setViewingOrgNameState(null);
    }
    // Hard reload to ensure all queries refetch with new org context
    setTimeout(() => window.location.reload(), 50);
  }, []);

  // If somehow set but user is not super-admin, clear it
  useEffect(() => {
    if (email && !isSuperAdmin && viewingOrgId) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      setViewingOrgIdState(null);
      setViewingOrgNameState(null);
    }
  }, [email, isSuperAdmin, viewingOrgId]);

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
