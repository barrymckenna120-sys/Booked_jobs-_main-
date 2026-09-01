# Fixes: token-refresh shell churn (#1-3) + role-gate/finance loader timeout (#7 scoped)

Two small, independently reviewable steps. No changes to payments, messaging content, SW config, or any other finding category.

## Step A — token-refresh churn (#1-3)

Root pattern: `useAuth` calls `setUser(session?.user ?? null)` on every `onAuthStateChange` event including `TOKEN_REFRESHED`, producing a new `user` object identity roughly hourly. `useNotifications.ts` already guards by depending on `user?.id`; these three did not get the same treatment.

1. `src/hooks/useUserRole.ts` — change the effect dependency from `[user]` to `[user?.id]`. Prevents the hourly `setLoading(true)` re-run that reopens the `!roleLoading && isEngineer` gate window on the office shell.
2. `src/hooks/useUnreadMessages.ts` — key both the `refresh` callback and the channel effect on `user?.id` instead of the `user` object. Stops the `unread-messages-*` channel being torn down and rebuilt, and stops the extra count query, on every token refresh.
3. `src/components/messages/MessageAlertBanner.tsx` — key the `message-alerts` channel effect on `user?.id` instead of `user`.

Behaviour change: none other than not rebuilding subscriptions/queries on token refresh. All three use `user.id` only as a scalar inside the effects, so no call-site or prop changes are needed.

## Step B — loader timeout, scoped to two files (#7, first pass only)

The two highest-consequence hang-with-no-timeout paths:

4. `src/hooks/useUserRole.ts` — wrap both profile/engineer lookups in `withRequestTimeout` (already exists at `src/lib/queryDefaults.ts:70`), and ensure `setLoading(false)` runs in a `finally` (or catch) so a hung or rejected request can never leave `roleLoading` true indefinitely. On timeout, resolve to the same fallback the no-engineer-row path uses (`role: "engineer"`, `canAccessOffice: false`) — consistent with the hook's documented fail-safe.
5. `src/pages/Finance.tsx:407-416` — wrap the `Promise.all` in `withRequestTimeout`, add a catch that clears `loading` and surfaces the existing error/empty state instead of spinning forever.

The remaining ~20 loader files are explicitly out of scope for this step, per the report's own recommendation to batch them later.

## Verification (static + build)

- TypeScript compiles; no dependency-array warnings introduced.
- `roleLoading` no longer flips on a `TOKEN_REFRESHED` event (effect no longer re-runs because `user?.id` is unchanged).
- A hung Supabase request resolves to the fallback state within `REQUEST_TIMEOUT_MS` (15s) instead of never.

Deferred, not part of this plan: fixes #4-6 (redundant polling) and #8 (1s DOM watchdog) — to be batched later as a single efficiency pass.
