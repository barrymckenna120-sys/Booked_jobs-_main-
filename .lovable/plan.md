## Goal
Gate `/` so authenticated users skip the marketing page and land on their proper home. Logged-out users keep seeing `<Index />`. No flash of marketing before redirect.

## Changes

### 1. New file: `src/lib/resolveLandingPath.ts`
Extract the exact role-lookup currently inlined in `src/pages/Auth.tsx` (lines 102–119) into one shared helper so `Auth.tsx` and the new `RootRoute` cannot diverge.

```ts
import { supabase } from "@/integrations/supabase/client";

export async function resolveLandingPath(userId: string): Promise<string> {
  const { data: engineerRow } = await supabase
    .from("engineers")
    .select("role, can_access_office")
    .eq("auth_user_id", userId)
    .maybeSingle();
  const role = (engineerRow as any)?.role;
  const canOffice = !!(engineerRow as any)?.can_access_office;
  const elevated = ["owner", "manager", "admin", "office"].includes(role);
  if (role === "engineer" && !canOffice && !elevated) {
    return "/engineer/today";
  }
  return "/dashboard";
}
```

### 2. `src/pages/Auth.tsx` (lines 102–120)
Replace the inline lookup with:
```ts
let redirectPath = "/dashboard";
const userId = signInData?.user?.id;
if (userId) {
  redirectPath = await resolveLandingPath(userId);
}
navigate(redirectPath);
```
Add the import. No other logic changes — the catch block, timeout race, and everything else stay identical.

### 3. `src/App.tsx`
Add a `RootRoute` component (near `RecoveryRedirectGuard`) and swap line 133.

```tsx
const RootRoute = () => {
  const { user, loading } = useAuth("");   // "" disables useAuth's own redirect
  const [target, setTarget] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    setResolving(true);
    resolveLandingPath(user.id)
      .then(setTarget)
      .finally(() => setResolving(false));
  }, [loading, user]);

  if (loading || (user && (resolving || !target))) {
    // Match AppContent's loading visual, minimal — no marketing flash.
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", backgroundColor:"#ffffff" }}>
        <img src="/icons/icon-192.png" style={{ width: 80, height: 80 }} />
      </div>
    );
  }

  if (!user) return <Index />;
  return <Navigate to={target!} replace />;
};
```

Line 133 becomes:
```tsx
<Route path="/" element={<RootRoute />} />
```

Note: `useAuth("")` — passing an empty `redirectTo` avoids the hook's own `navigate("/auth")` for logged-out users, which we need since `/` is a valid logged-out destination. Verified in `src/hooks/useAuth.tsx` — the redirect guard is `if (!session?.user && redirectTo && !isPublicPath(...))`, so a falsy `redirectTo` is a clean opt-out and doesn't require touching the hook.

## Not touching
`*` catch-all, `AppContent`, `RecoveryRedirectGuard`, `Auth.tsx`'s post-login navigate call itself, `useAuth`, any other route, styling, or unrelated logic.

## Verification (post-build)
1. Superadmin logged in → visit `/` → lands on `/dashboard`.
2. Engineer (no office access) logged in → visit `/` → lands on `/engineer/today`.
3. Logged out → visit `/` → marketing page renders as before.
4. No visible flash of marketing before redirect in cases 1 & 2.
