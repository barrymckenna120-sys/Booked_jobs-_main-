import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const useAuth = (redirectTo = "/auth") => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const initialCheckDone = useRef(false);

  useEffect(() => {
    // Get session first before subscribing to changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      initialCheckDone.current = true;
      if (session?.user) {
        linkEngineerAuthId(session.user);
      }
      if (!session?.user && redirectTo) {
        navigate(redirectTo, { replace: true });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only act on auth changes after initial check is done
        if (!initialCheckDone.current) return;
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user && redirectTo && event === "SIGNED_OUT") {
          navigate(redirectTo, { replace: true });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, redirectTo]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return { user, loading, signOut };
};
