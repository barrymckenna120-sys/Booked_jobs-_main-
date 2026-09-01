# Tab-focus refetch storm — root cause and fix

You are right that this is not throttling and not the realtime debounce failing. The Jobs realtime debounce is intact; the refetches are coming from three *other* triggers that fire when the tab regains visibility. This affects every page, not just Jobs.

## What's actually happening

**1. Auth identity churn on tab return (the big one, and it explains the Jobs bursts)**

The auth hook does `setUser(session?.user ?? null)` on *every* auth event, including `TOKEN_REFRESHED`. The Supabase client re-checks and refreshes the session whenever the tab becomes visible, so each tab return emits an auth event, which produces a brand-new `user` object even though it's the same user.

Jobs keys both of its effects on that object:

```text
tab hidden -> tab visible
  -> supabase refreshes session -> TOKEN_REFRESHED
  -> setUser(new object)
  -> Jobs effect [user, ready] re-runs        -> full 3-query refetch
  -> Jobs realtime effect [user, ready] re-runs -> removeChannel + re-subscribe
```

Because the effect fires *before* the debounce is involved, the 1.5s debounce cannot suppress it — the debounce only covers realtime events. And on Slow 3G the refresh is slow and may be retried, so you get several events and therefore several bursts, exactly as you saw. This is the same class of bug as the earlier `useUserRole` / `useNotifications` churn — same root cause, just at pages that still depend on the whole `user` object rather than `user?.id`.

**2. Notifications refetch twice per tab return**

`useNotifications` registers the same foreground handler on both `visibilitychange` *and* `focus`. A normal tab switch fires both, so every return does two `notifications` GETs plus two unread HEAD counts.

**3. `engineers` + `job_media` in your capture come from the engineer data hook**

`useEngineerJobs` has an explicit `visibilitychange` -> `fetchAll()` (jobs, engineers, customers, job_media) with no dedupe or minimum interval. That refetch is intentional for engineers returning to the app, but it is uncapped and will double up with the auth-churn refetch above.

## Fix (all at the shared trigger level, no per-page patching)

1. **Stop identity churn at the source** — in the auth hook, only call `setUser` when the user id actually changes (or the session flips to/from null). A token refresh for the same user then produces no new object, so no downstream effect re-runs anywhere in the app. This is the single change that removes most of the storm.
2. **Make Jobs' effects id-keyed** — depend on `userId` (and `ready`) instead of the `user` object, so the list fetch and the realtime subscription no longer churn even if some other auth event slips through. Keeps the existing debounce, retry cap and narrowed queries untouched.
3. **Deduplicate the notifications foreground handler** — keep both listeners (iOS needs them) but ignore a trigger that lands within ~2s of the previous one, so a tab switch causes one refresh instead of two.
4. **Rate-limit the engineer foreground refetch** — keep the behaviour, but skip `fetchAll()` if it already ran in the last ~15s, and use the id-keyed dependency for the same reason as Jobs.

Not changing: the realtime debounce, retry caps, query shapes, the parts badge poll, or the service-worker config.

## Verification

- Playwright on a real session: load `/jobs`, then hide/show the tab 5 times and count REST calls. Expect **0** new `service_calls` / `customers` / `quotes` calls per tab return (currently 1 full burst each, more on slow links), and at most one `notifications` GET+HEAD pair.
- Same tab-switch loop on `/dashboard`, `/schedule`, `/customers` to confirm the auth-level fix quietened the whole shell.
- Regression pass on an office/superadmin account across the office routes plus `/engineer/today`, checking data still refreshes after a real job change (realtime) and after coming back online.
- `tsgo --noEmit` plus the existing test suite; add a unit test for the "same user id -> no state update" rule and for the foreground dedupe window.

## Technical notes

- `src/hooks/useAuth.tsx` ~line 113: unconditional `setUser(session?.user ?? null)` inside `onAuthStateChange`.
- `src/pages/Jobs.tsx` lines 90-115: both `useEffect`s use `[user, ready]`.
- `src/hooks/useNotifications.ts` lines ~326-357: `visibilitychange` + `focus` share one handler.
- `src/hooks/useEngineerJobs.ts` lines ~774-786: `visibilitychange`/`online` -> `fetchAll()`, dependency `[user, fetchAll]`.
- `refetchOnWindowFocus` is already `false` globally in `src/App.tsx`, so React Query is not the trigger.

Risk: touching the auth hook is app-wide, so it is worth treating as its own review-gated step; steps 2-4 are local and low risk. Jobs is a read-only list, but `useEngineerJobs` also owns job writes, so the rate limit there must not touch `updateJob`.
