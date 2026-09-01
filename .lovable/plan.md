# Post-fix verification: follow-ups

The two shipped fixes verified clean (details in chat). Three items remain open. None are regressions from the shipped fixes; all are adjacent findings surfaced while verifying.

## 1. Notification refetch on every navigation (investigate, then fix)

Observed in the browser: two `[useNotifications] fetch` round trips fire on each office page change (Jobs, Customers, Finance), even though the shell no longer remounts. Cause not yet confirmed — the initial-fetch effect depends on the full `user` object and on the `fetchNotifications` callback (`[user, applyRoleScope, surface]`), so any change in `user` identity re-runs it, but the trigger on navigation is unproven.

Step 1 is to confirm the trigger (temporary instrumentation of the effect's dependency identities in dev only), then apply the minimal fix — most likely keying the effect on `user?.id` the same way the realtime channel already is. Do not change what the fetch queries or how notifications are scoped.

## 2. Full-`user` dependencies left elsewhere

`src/pages/Finance.tsx` fetch effect (`[user, orgId]`), `useNotifications` initial-fetch and sound-preference effects, and the foreground-recheck effect all still depend on the whole `user` object, so an hourly `TOKEN_REFRESHED` still triggers redundant reads on those paths. Same one-line treatment as the shipped fixes: depend on `user?.id`. Low risk, no behaviour change.

## 3. Verification gaps that need a credentialled session

Two checks could not be completed in this pass and should not be recorded as passes:

- Forcing a real `TOKEN_REFRESHED` event: calling `refreshSession()` on the injected preview session fails ("Refresh token is not valid") and signs the session out, so the no-churn claim rests on code review only.
- Sign-in end to end: no test credentials are available in this environment, only session injection.

Both become testable with a dedicated non-privileged test login (Cavan Gas tenant). Until then, treat the token-refresh no-churn behaviour as code-verified, not behaviour-verified.

## Not proposed

No change to `vite.config.ts`, service-worker config, or `PWAUpdateBanner.tsx`. The pre-existing "Function components cannot be given refs" dev warnings are unrelated to these fixes and out of scope here.
