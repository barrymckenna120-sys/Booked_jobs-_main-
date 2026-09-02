import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";


/** Auto-link engineer record to auth account on first login, then store FCM token.
 * Runs at most once per browser session per auth user to prevent N-per-mount
 * PATCH stampedes across the ~91 useAuth() call sites, and skips the auth_user_id
 * link entirely when the email is ambiguous (multiple engineer rows share it) or
 * when a previous PATCH failed (e.g. 409 unique-constraint conflict). */
const linkAttempted = new Set<string>();

const linkEngineerAndCaptureFcm = async (user: User) => {
  if (!user.email) return;
  if (linkAttempted.has(user.id)) return;
  linkAttempted.add(user.id);
  try {
    // Step 1: only auto-link auth_user_id when the email uniquely identifies
    // one engineer row AND that row has no auth_user_id yet. If the email is
    // shared by multiple rows, do nothing — a duplicate would trigger a 409
    // against the UNIQUE(auth_user_id) constraint in a tight remount loop.
    const { data: engineersByEmail } = await supabase
      .from("engineers")
      .select("id, auth_user_id")
      .eq("email", user.email)
      .limit(2);

    if (engineersByEmail && engineersByEmail.length === 1) {
      const row = engineersByEmail[0];
      if (row.auth_user_id === null) {
        const { error: linkError } = await supabase
          .from("engineers")
          .update({ auth_user_id: user.id } as any)
          .eq("id", row.id)
          .is("auth_user_id", null);
        if (linkError) {
          // Don't retry on subsequent mounts — the guard above already blocks
          // repeats, but log once so the failure is visible.
          console.warn("[Auth] engineer auth_user_id link skipped:", linkError.message);
        }
      }
    }

    // Step 2: capture FCM token for the engineer (only if a row is linked to this user)
    const { data: engineer } = await supabase
      .from("engineers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (engineer) {
      // Loaded on demand: a static import puts the whole Firebase SDK on the
      // startup critical path for every visitor, including the login screen.
      const { getFcmToken } = await import("@/lib/firebase");
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


// Public route prefixes that must NEVER trigger an auth redirect,
// even when the visitor has no session. Keep in sync with public
// routes declared in src/App.tsx.
const PUBLIC_PATH_PREFIXES = [
  "/certificates/",
  "/certificate/",
  "/cert/",
  "/quote/",
  "/pdf/",
  "/invoice/",
  "/receipt/",
  "/hazard/",
  "/r/",
  "/b/",
  "/reset-password",
  "/privacy-policy",
  "/terms-and-conditions",
  "/data-processing-agreement",
  "/offline",
];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATH_PREFIXES.some(
    (p) => pathname === p || pathname === p.replace(/\/$/, "") || pathname.startsWith(p)
  );

/**
 * Supabase re-checks/refreshes the session whenever the tab becomes visible,
 * emitting TOKEN_REFRESHED. Publishing that session unconditionally handed every
 * one of the ~91 useAuth() consumers a brand-new `user` object for the *same*
 * user, so any effect keyed on `user` (e.g. the Jobs list fetch + its realtime
 * subscription) re-ran on every tab return — a full refetch burst per focus,
 * which the realtime debounce cannot see or suppress.
 *
 * Keep the previous object when the identity is unchanged. Sign-in, sign-out and
 * password-recovery flows all change identity, so they still propagate.
 */
export const nextUserState = (prev: User | null, next: User | null): User | null => {
  if (prev === next) return prev;
  if (prev && next && prev.id === next.id) return prev;
  return next;
};

export const useAuth = (redirectTo = "/auth") => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const initialCheckDone = useRef(false);

  useEffect(() => {
    const setUserIfChanged = (next: User | null) => {
      setUser((prev) => nextUserState(prev, next));
    };


    // Get session first before subscribing to changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserIfChanged(session?.user ?? null);
      setLoading(false);
      initialCheckDone.current = true;
      if (session?.user) {
        linkEngineerAndCaptureFcm(session.user);
      }
      if (!session?.user && redirectTo && !isPublicPath(window.location.pathname)) {
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
        setUserIfChanged(session?.user ?? null);
        setLoading(false);
        if (!session?.user && redirectTo && !isPublicPath(window.location.pathname)) {
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
