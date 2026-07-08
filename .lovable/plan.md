## Findings

1. **Source present, not deployed.** `supabase/functions/impersonate-org/index.ts` exists and looks correct (validates caller as superadmin, mints an HMAC-signed token from `IMPERSONATION_HMAC_SECRET`, bootstraps the vault secret). But a direct curl to `/impersonate-org` returns `404 NOT_FOUND` — the function has never been deployed to the project. This is the "Failed to fetch" the client sees.
2. **Client URL is correct.** `useAdminViewAs.tsx` calls it via `supabase.functions.invoke("impersonate-org", ...)`, which uses the project URL baked into the generated client. No change needed there.
3. **Env vars are fine.** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `IMPERSONATION_HMAC_SECRET` are all present in the secrets list. `SUPABASE_URL` is auto-injected by the platform for Edge Functions.

## Plan (no source file changes)

Deploy the existing `impersonate-org` function using `supabase--deploy_edge_functions` with `["impersonate-org"]`, then verify with a curl to `/impersonate-org` (expect `401 Missing bearer token` when unauthenticated, or a `{token, exp}` payload when the current logged-in superadmin session is attached — either is proof it's live and no longer 404). If deploy fails, check `edge_function_logs` for the boot error and iterate.

No project source files will be modified. Only the deployment state changes.