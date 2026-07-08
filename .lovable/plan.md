Add temporary console.log diagnostics to trace why the impersonation token is not being attached to Supabase requests in View As mode.

Changes (no logic changes, only logging):

1. `src/integrations/supabase/orgHeaderInterceptor.ts`
   - After the signed-token validity check (inside the `if` block that chooses `x-org-impersonation-token`), add a log confirming the token path was taken, the selected org, and remaining seconds until expiry.
   - Inside the `else` fallback path (where `x-org-id` is sent), add a log dumping the token state (`cachedToken` presence, `cachedTokenOrg`, `adminSelectedOrgId`, expiry, current time, and diff) so we can see why the signed token was rejected.

2. `src/hooks/useAdminViewAs.tsx`
   - After a successful Edge Function mint and `setImpersonationToken(...)` call, add a log confirming the token was minted and its expiry.

No other files will be changed. These logs are temporary and should be removed once the root cause is identified.