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
    if (!user) {
      setRole("admin");
      setEngineerId(null);
      setEngineerName(null);
      setCanAccessOffice(false);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("engineers")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (data) {
        setRole((data.role as AppRole) || "engineer");
        setEngineerId(data.id);
        setEngineerName(data.name);
        setCanAccessOffice((data as any).can_access_office === true);
      } else {
        setRole("admin");
        setEngineerId(null);
        setEngineerName(null);
        setCanAccessOffice(false);
      }
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  const isEngineer = role === "engineer";
  const isAdmin = role === "admin";
  const isOffice = role === "office";

  return { role, isEngineer, isAdmin, isOffice, engineerId, engineerName, canAccessOffice, loading };
};
