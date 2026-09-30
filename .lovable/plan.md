# Tenant page fails on first click: diagnose, then fix

## What the code shows now (read, not reproduced)
- `loadAll()` (`src/pages/admin/TenantDetail.tsx:234-292`) runs once the superadmin check passes (`:171-194`, `:294-297`).
- A failed organisations query throws a Supabase error object. That object is not an `Error`, so the toast at `:288` always says "Failed to load tenant" and the real code and message are lost.
- When the query errors or returns 0 rows, `org` stays empty, so the page shows "Tenant not found". Failed and missing tenants look identical.
- Errors from `tenant_integrations` (`:248`) and `settings` (`:258`) are ignored.
- The root cause is not confirmed yet. Step 1 finds it.

## Step 1: diagnose (read-only, then stop and report)
1. Use Playwright on the preview, signed in as the superadmin account, and record every request plus localStorage.
   - Sign-in uses only a session minted by the platform (no password). No password is typed, hard-coded, logged or stored anywhere: code, plan, fixtures or output. If that isn't possible, I stop and you do the capture.
2. Runs:
   - A. Fresh sign-in: /admin, then click a tenant.
   - B. The same after using View-as and then exiting it.
   - B2. View-as still active (not exited): go to /admin and click a different tenant. This is the case most likely to send a stale x-org-impersonation-token / x-org-id.
   - C. The same with an expired access token in the session, to stand in for the 1h+ idle tab. A real 1-hour wait isn't possible in the sandbox, so this is simulated and I'll label it that way.
   - Then click Back and the tenant again.
3. For the first failing attempt and for the working second attempt, capture the organisations request:
   - status code and raw body (code/message)
   - whether Authorization, x-org-impersonation-token and x-org-id were sent (yes/no only; values are never printed)
   - `adminViewingOrgId` and `adminImpersonationTokenExp` at that moment
4. If A, B, B2 and C all load on the first click, I report "not reproduced" with no guessing. I then give you exact steps for a capture in your own browser: DevTools, Network tab, the organisations request, then its status, its response, and which headers were present.
5. Report raw output only, then stop.

## Step 2: fix (only after you approve Step 1; `TenantDetail.tsx` only)
- a. The toast shows the real message and code. The error goes to Sentry with orgId, status, and whether the View-as headers were present.
- b. On 401, JWT expired or PGRST301: call `supabase.auth.refreshSession()` and retry `loadAll()` once, before showing any error.
- c. Separate "error" and "not found" states. The error state shows the message and a Retry button that re-runs `loadAll()` on the same page.
- d. Errors from `tenant_integrations` and `settings` are included in (a).
- e. Regression test, the one allowed new test file next to the page, covering three cases:
  - JWT expired, then refresh and retry, then the page renders
  - 0 rows shows "Tenant not found"
  - a non-auth failure shows the error state with Retry

## Evidence
Diff and commit hash on dev, the test output, and a live Playwright run showing the tenant loads on the first click.

## Open point
Step 2e adds a test file, which goes beyond "TenantDetail.tsx only". Approving this plan approves that one extra test file.
