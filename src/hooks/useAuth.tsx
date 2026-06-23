import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { getFcmToken } from "@/lib/firebase";

/** Auto-link engineer record to auth account on first login, then store FCM token */
const linkEngineerAndCaptureFcm = async (user: User) => {
  if (!user.email) return;
  try {
    // Step 1: auto-link auth_user_id if missing OR stale (doesn't match current auth user)
    const { data: engineerByEmail } = await supabase
      .from("engineers")
      .select("id, auth_user_id")
      .eq("email", user.email)
      .maybeSingle();
    if (engineerByEmail && engineerByEmail.auth_user_id !== user.id) {
      await supabase
        .from("engineers")
        .update({ auth_user_id: user.id } as any)
        .eq("id", engineerByEmail.id);
    }

    // Step 2: capture FCM token for the engineer
    const { data: engineer } = await supabase
      .from("engineers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (engineer) {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        await supabase
          .from("engineers")
          .update({ fcm_token: fcmToken } as any)
          .eq("id", engineer.id);
      }
    }
  } catch {
    // Non-critical — silently ignore
  }
};

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
        linkEngineerAndCaptureFcm(session.user);
      }
      if (!session?.user && redirectTo) {
        navigate(redirectTo, { replace: true });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only act on auth changes after initial check is done
        if (!initialCheckDone.current) return;
        if (event === "TOKEN_REFRESHED") {
          console.log("[Auth] Token refreshed for user:", session?.user?.id);
        }
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user && redirectTo) {
          navigate(redirectTo, { replace: true });
        }
      }
    );

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            supabase.auth.signOut();
          }
        });
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [navigate, redirectTo]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return { user, loading, signOut };
};
