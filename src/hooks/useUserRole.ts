import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "office" | "engineer";

/**
 * Returns the current user's role by checking if their auth ID
 * is linked to an engineer record. Falls back to "admin".
 */
export const useUserRole = (user: User | null) => {
  const [role, setRole] = useState<AppRole>("admin");
  const [engineerId, setEngineerId] = useState<string | null>(null);
  const [engineerName, setEngineerName] = useState<string | null>(null);
  const [canAccessOffice, setCanAccessOffice] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setRole("admin");
      setEngineerId(null);
      setEngineerName(null);
      setCanAccessOffice(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("engineers")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
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
          setRole("engineer");
          setEngineerId(null);
          setEngineerName(null);
          setCanAccessOffice(false);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isEngineer = role === "engineer";
  const isAdmin = role === "admin";
  const isOffice = role === "office";

  return { role, isEngineer, isAdmin, isOffice, engineerId, engineerName, canAccessOffice, loading };
};
