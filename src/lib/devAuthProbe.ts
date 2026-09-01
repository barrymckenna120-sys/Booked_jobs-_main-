// TEMPORARY — behavioural verification of the token-refresh fix (BJ token-refresh churn).
//
// Exposes `window.__debugAuth` in dev/preview builds ONLY. `import.meta.env.DEV`
// is statically replaced at build time, so this whole module's side effect is
// dead code in a production build and never ships to real users.
//
// REMOVE THIS FILE (and its import in src/main.tsx) once the token-refresh test
// has been signed off, exactly as the Step 3 force-error trigger was removed.
import { supabase } from "@/integrations/supabase/client";

type DebugAuth = {
  /** Who is signed in right now — confirms the session under test. */
  whoAmI: () => Promise<void>;
  /** Forces a real TOKEN_REFRESHED event on the current session. */
  refreshSession: () => Promise<void>;
};

export function installDevAuthProbe() {
  if (!import.meta.env.DEV) return;

  const api: DebugAuth = {
    async whoAmI() {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        console.log("[__debugAuth] no active session", error?.message ?? "");
        return;
      }
      const { user } = data.session;
      console.log("[__debugAuth] signed in as", {
        userId: user.id,
        email: user.email,
        expiresAt: data.session.expires_at,
      });
    },
    async refreshSession() {
      console.log("[__debugAuth] forcing token refresh…");
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.log("[__debugAuth] refresh FAILED:", error.message);
        return;
      }
      console.log("[__debugAuth] refresh OK — new token expires at", data.session?.expires_at);
    },
  };

  (window as unknown as { __debugAuth: DebugAuth }).__debugAuth = api;
  console.log("[__debugAuth] dev auth probe ready: __debugAuth.whoAmI() / __debugAuth.refreshSession()");
}
