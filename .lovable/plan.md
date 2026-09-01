# Approved fixes: #1 notification refetch, #2 residual full-`user` deps

Scope: the two approved items only. #3 (Cavan Gas test login) stays out of scope — the token-refresh and sign-in checks remain marked code-verified, not behaviour-verified, until that login exists.

## 1. Notification refetch on every navigation

Observed: two `[useNotifications] fetch` round trips on each office page change, even though the shell no longer remounts. Cause unconfirmed — the initial-fetch effect depends on the full `user` object and on the `fetchNotifications` callback (`[user, applyRoleScope, surface]`).

Steps:
1. Confirm the trigger first with temporary dev-only instrumentation of the effect's dependency identities, then re-run the navigation test in the browser to see which dependency changes.
2. Apply the minimal fix — expected to be keying the initial-fetch effect on `user?.id` (and stabilising `fetchNotifications` / `refreshUnreadCount` the same way) so navigation and hourly token refresh stop re-triggering it.
3. Remove the instrumentation, re-run the same navigation test, and confirm the fetch count drops to one per session rather than two per navigation.

No change to what the fetch queries, to role scoping, or to the realtime channel (already keyed on `user?.id`).

## 2. Residual full-`user` dependencies

Switch to `user?.id` in:
- `src/pages/Finance.tsx` fetch effect (`[user, orgId]`)
- `src/hooks/useNotifications.ts` sound-preference effect and foreground-recheck effect

Same one-line pattern as the shipped fixes; no behaviour change, only fewer redundant reads on `TOKEN_REFRESHED`.

## Verification

- `tsgo` typecheck clean.
- Browser: sign in via injected session, navigate Dashboard → Jobs → Customers → Finance, confirm shell node identity unchanged, notification fetch count reduced, Finance still loads with data, and no new console errors.
- No payment, messaging-send, or data-mutating actions.

## Not touched

`vite.config.ts`, service-worker config, `PWAUpdateBanner.tsx`. The pre-existing "Function components cannot be given refs" dev warnings stay out of scope.
