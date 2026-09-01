# PWA reliability sweep — Steps 2-4 regression review (static, no code changed)

## 1. Boundary / key scoping audit — clean

Only three keyed or nested boundaries remain, and all are correctly scoped:

- `src/components/layout/AppLayout.tsx:277-279` — `<ErrorBoundary key={location.pathname} name="office-route">` wraps `<Outlet />` only. Sidebar, bell, role check all sit above it.
- `src/components/engineer/EngineerLayout.tsx:176-178` — same shape, wraps `<Outlet />` only.
- `src/App.tsx:229` — outer boundary now unkeyed after the fix; `src/App.tsx:221` `<Suspense>` wraps the tree but Suspense has no key, so it does not remount anything.
- `src/pages/Dashboard.tsx:245,252` — Suspense scoped to the two secondary panels only.
- `PWAUpdateBanner` is mounted at `src/App.tsx:576`, i.e. after `</Routes>` and outside the boundary — so `useRegisterSW` is never remounted by navigation.

No other component in `src/` is keyed by pathname or route param (the remaining `key={idx}`/`key={id}` hits are list rendering).

## 2. Effect / subscription teardown audit — one real pattern found

24 realtime channels exist. Each one checked has a `supabase.removeChannel` cleanup, so nothing leaks. The problem is the **dependency identity**, not the cleanup.

`src/hooks/useAuth.tsx:112-120` calls `setUser(session?.user ?? null)` on every `onAuthStateChange` event, including `TOKEN_REFRESHED`. That produces a **new `user` object identity** roughly hourly.

`src/hooks/useNotifications.ts:388-390` deliberately guards against this:

```
// Depend on user?.id rather than the full user object so
// token-refresh events don't tear down and rebuild the subscription.
const userId = user?.id;
```

These shell-level consumers did **not** get the same treatment and therefore tear down and re-subscribe on every token refresh:

- `src/hooks/useUnreadMessages.ts:38-49` — effect deps `[user, perspective, jobId, refresh]`, and `refresh` itself is a `useCallback` on `[user, perspective, jobId]`, so the whole channel is rebuilt and a fresh count query fires.
- `src/components/messages/MessageAlertBanner.tsx:29-67` — effect deps `[user]`; channel `message-alerts` rebuilt on refresh.
- `src/hooks/useUserRole.ts:24-87` — effect deps `[user]`; on refresh it re-runs `setLoading(true)` plus two queries. Because `AppLayout` gates on `!roleLoading && isEngineer` (`src/components/layout/AppLayout.tsx:133-135`), a token refresh momentarily reopens the role-resolution window on the office shell.

Separate, lower-grade finding in the same file: `src/components/layout/AppLayout.tsx:113-131` runs a `window.setInterval(check, 1000)` Radix pointer-events watchdog for the entire office session, in addition to a `MutationObserver` on `document.body` that already covers the same condition.

Note this is a pre-existing pattern (`useAuth` is local state per call site, ~91 call sites), not something Steps 2-4 introduced — but it is the same category as the notification-channel bug and is still live.

## 3. QueryClient defaults interaction — confirmed conflict

Global defaults (`src/App.tsx:93-102`): `staleTime: 60_000`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, custom retry.

`refetchInterval` ignores `staleTime` entirely — it refetches on the timer regardless of freshness. Four active polls:

- `src/pages/Parts.tsx:62` — `refetchInterval: 30000`, **and** an `office-parts-realtime` channel at `src/pages/Parts.tsx:118`. Same data arriving by two mechanisms.
- `src/components/dashboard/LiveActivityFeed.tsx:45` — `refetchInterval: 30000`, **and** `activity-feed-realtime` channel at line 52. Same double-source.
- `src/components/layout/AppLayout.tsx:93` — nav badge `parts-nav-count`, `refetchInterval: 30000`, no realtime channel; polls for the entire office session.
- `src/components/dashboard/RenewalsCard.tsx:143` — `refetchInterval: 60000`, no channel.
- `src/pages/Renewals.tsx:169` — a separate non-React-Query `setInterval(() => fetchCustomers(true), 30000)`.

Benign overrides, no action needed:

- `src/pages/Settings.tsx:74-75` — `staleTime: 0, gcTime: 0`, intentional so settings are always read fresh.
- `src/pages/Parts.tsx:76` and `src/hooks/useLastCompletedService.ts:19` — longer/shorter `staleTime` only, no refetch loop.

No double-fetching caused by the defaults themselves was found; the cost is entirely the timers above.

## 4. Service worker / update banner — clean

`vite.config.ts` is unchanged in substance: `registerType: "prompt"` (line 18), `skipWaiting: false` and `clientsClaim: false` (lines 33-34) with the comment explaining why, `cleanupOutdatedCaches: true` (line 28), and the `/assets/` CacheFirst runtime rule (lines 107-119, `cacheName: "assets"`, 200 entries / 30 days). `PWAUpdateBanner` still drives updates via `useRegisterSW` and is mounted outside the routed tree. Steps 3-4 did not touch this path.

## 5. Loading-state audit — pattern is widespread but mostly harmless; one real gap

25 files set a loading flag with no `finally`. For most of them this is benign: Supabase query builders resolve with `{ data, error }` rather than rejecting, so the following `setLoading(false)` still runs on failure.

The genuine gap is **hang, not failure**: none of these paths use the `withRequestTimeout` helper that already exists at `src/lib/queryDefaults.ts:70-88`. A request that never settles on weak signal leaves the loader up forever. Highest-impact instances:

- `src/hooks/useUserRole.ts:34-83` — `setLoading(true)` then two sequential awaits, no timeout. A hang here freezes the office shell's role gate.
- `src/pages/Finance.tsx:407-416` — `setLoading(true)` → `await Promise.all([...])` → `setLoading(false)`, no timeout and no error branch.
- Same shape in `src/pages/WarrantyTracker.tsx`, `src/pages/IncomingJobs.tsx`, `src/pages/AuditLog.tsx`, `src/pages/BusinessInsightsDashboard.tsx`, `src/pages/InvoicePreview.tsx`, `src/pages/EngineerAvailability.tsx`, `src/pages/TeamManagement.tsx`, plus panel components (`CustomerHistoryPanel`, `CustomerActivityTimeline`, `WhatsAppSendLog`, `MessagingCatalogueTab`, `LoginEventsTable`, `UserActivityOverview`, `PartCommentsThread`, `QuotePanel`, `BoilerBrandsTab`, `MessageStatusPanel`).

Note the screens already fixed (JobDetail, ServiceReceipt) are absent from this list, confirming those fixes hold.

## 6. Dashboard deferred panels — clean

`src/pages/Dashboard.tsx:58` still calls `useDeferredMount()`, and lines 243-258 gate both `JobsUpdateSection` and `TodaysRevenueCard` behind `secondaryReady` with a `SecondaryPanelSkeleton` placeholder plus a `Suspense` fallback. `src/hooks/useDeferredMount.ts` is intact (requestIdleCallback with a 1200ms timeout fallback, cancel on unmount). The shell-remount fix touched nothing here.

---

# Proposed fixes, by severity

## High — shell churn on token refresh (item 2)

Apply the `useNotifications` pattern consistently: depend on `user?.id`, not the `user` object.

1. `src/hooks/useUserRole.ts` — key the effect on `user?.id`. Prevents the hourly role-resolution flash on the office shell.
2. `src/hooks/useUnreadMessages.ts` — key `refresh` and the channel effect on `user?.id`.
3. `src/components/messages/MessageAlertBanner.tsx` — key the channel effect on `user?.id`.

Three small, independent edits; no behaviour change other than not rebuilding on refresh.

## Medium — redundant polling alongside realtime (item 3)

4. `src/pages/Parts.tsx` and `src/components/dashboard/LiveActivityFeed.tsx` — drop `refetchInterval` where a realtime channel already invalidates the same data; keep the channel as the single trigger.
5. `src/components/layout/AppLayout.tsx` nav badge and `src/components/dashboard/RenewalsCard.tsx` — either lengthen the interval materially or invalidate from an existing channel instead of polling for the whole session.
6. `src/pages/Renewals.tsx:169` — same treatment for the hand-rolled 30s interval.

Each is a one-line-ish change and independently revertible.

## Medium — indefinite loaders on hung requests (item 5)

7. Wrap the highest-traffic fetches in `withRequestTimeout` and add an error branch that clears the loader, starting with `useUserRole.ts` and `Finance.tsx`, then the remaining office screens in a second pass. Prefer doing this in small batches rather than a 20-file sweep.

## Low — session-long DOM poll (item 2)

8. `src/components/layout/AppLayout.tsx:113-131` — the MutationObserver already fires on the exact mutation the interval is looking for; consider dropping the 1s interval, or raising it to ~5s as a belt-and-braces backstop.

## Not proposed

Items 1, 4 and 6 need no changes.
