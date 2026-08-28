# Step 4 — Calm the Network

## What I found

**QueryClient has no defaults at all.** `src/App.tsx:89` is a bare `new QueryClient()`, so every query in the app currently runs with React Query's defaults: 3 retries with exponential backoff, `staleTime: 0` (everything refetches on every mount), and `refetchOnWindowFocus: true`. On weak 4G that means each screen re-hammers the network every time the engineer switches back to the app.

**Only five per-query overrides exist**, and none of them conflict with the proposed defaults — they'd all still work:
- `Parts.tsx` (`refetchInterval: 30000`, `staleTime: 5min`), `Settings.tsx` (`staleTime: 0`), `AppLayout.tsx` nav badge (`refetchInterval: 30000`), `LiveActivityFeed.tsx` (30s), `RenewalsCard.tsx` (60s), `useLastCompletedService.ts` (`staleTime: 30s`).

**The two stuck loaders have the same root cause: no `try/catch/finally`.**
- `JobDetail.tsx:448-472` — `fetchJob()` awaits Supabase with no `try/catch`. If the request rejects (network drop, hung fetch), the async function rejects unhandled and `setLoading(false)` on line 471 never runs → permanent spinner at line 574. There's also an early `return` on the not-found path (line 456-460) that leaves `loading` true while navigating.
- `ServiceReceipt.tsx:80-121` — identical shape. No `try/catch`, `setLoading(false)` only on the happy path, and the not-found branch (line 94-98) returns without clearing loading. Additionally line 212 `if (!job || !customer) return null` renders a **blank white screen** if the customer row fails to load — exactly the failure Step 3 was meant to eliminate.
- Neither screen has a timeout, so a socket that hangs rather than errors never resolves either way.

**Startup order.** Auth gating is fine (`useAuth` → `authLoading`), and the core screens are reached first. The problem is *within* the core screens: `Dashboard.tsx` mounts every panel eagerly and in parallel — `DashboardStatCards`, `TodayTimeline`, `NeedsAttentionCard`, `TodaysRevenueCard`, `JobsUpdateSection`, `AlertsPanel`, `FollowUpsPanel`, `PartsPanel`, plus `WeekSnapshot`, `LiveActivityFeed` (30s poll) and `RenewalsCard` (60s poll). On a weak connection today's schedule competes with analytics/renewals/activity-feed for the same few connections.

**Office Schedule caching has NOT started separately** — `Schedule.tsx` uses plain React Query with no localStorage/persistence layer, so there is nothing to avoid touching there. Engineer jobs *do* already have their own localStorage cache (`useEngineerJobs.ts:113-124`, key `bookedjobs_engineer_jobs_cache`) with correct `try/catch/finally` — that hook is already well-behaved and I will not change it.

**Tenant parity note.** Nothing in the fetch layer is tenant-specific, so the QueryClient defaults apply identically to K&N and Dublin Gas. The one tenant-sensitive spot is `ServiceReceipt.tsx:82-91`, which resolves `profiles.organisation_id` and then loads `settings` for that org — if that first request fails, the receipt currently renders with a blank business name rather than an error. The error path will be made explicit so both tenants fail loudly instead of silently rendering an unbranded receipt.

## Plan

### 1. Centralized QueryClient defaults — `src/App.tsx`
Replace the bare `new QueryClient()` with global defaults:
- `staleTime: 60_000` (one minute — screens stop refetching on every mount)
- `gcTime: 30 * 60_000` (cached data survives navigation on poor signal)
- `retry: 1` with `retryDelay` backoff capped at ~5s, and no retry on 4xx/permission errors (retrying an RLS denial never succeeds)
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: true` (one clean refetch when signal returns, instead of focus-driven storms)
- mutations: `retry: 0` (payments/completions must never silently double-fire — this preserves the existing `paymentPreWriteGate` guarantees)

No per-query overrides need changing; the five listed above intentionally opt out and will keep working.

### 2. Fix the two stuck loaders — `src/pages/JobDetail.tsx`, `src/pages/ServiceReceipt.tsx`
For both screens:
- Wrap the loader in `try/catch/finally` so `setLoading(false)` always runs.
- Add an explicit `error` state and render a small retry panel ("Couldn't load this job — Retry / Go back") instead of an endless spinner. Every loading state then reaches success, error, or empty.
- Add a request timeout (~15s) so a hung connection resolves into the error state rather than spinning forever.
- Clear `loading` on the not-found path before navigating away.
- `ServiceReceipt`: replace `return null` (blank screen) with the same error panel, and treat a missing `settings`/customer row as an error rather than rendering an unbranded receipt.
- `ServiceReceipt`: gate the auto-WhatsApp effect (line 68-78) so it can't fire off a send while the page is in an error state.

I'll reuse the existing `ErrorFallback` presentation *style* but won't modify `ErrorFallback.tsx` or `ErrorBoundary.tsx` — these are recoverable data errors inside a working screen, not crashes, so they belong in the screens themselves.

### 3. Defer secondary data — `src/pages/Dashboard.tsx`
Keep today's schedule and its stat cards eager. Defer the genuinely secondary panels (`LiveActivityFeed`, `WeekSnapshot`, `RenewalsCard`, and the reports-style panels) so they mount after the core screen has painted — via `React.lazy` + `Suspense` with a small skeleton, so their requests queue behind the schedule instead of competing with it. Their polling intervals stay as-is once mounted.

No change is needed to the Engineer app's startup order: `EngineerLayout` → `useEngineerJobs` already loads cached jobs first, then today's jobs, and job detail/certificates/media load only on navigation.

## Files touched
Four: `src/App.tsx` (QueryClient defaults), `src/pages/JobDetail.tsx`, `src/pages/ServiceReceipt.tsx` (stuck loaders), `src/pages/Dashboard.tsx` (defer secondary panels). More than one file is unavoidable because the two stuck loaders are separate screens with their own local state, and the deferral has to happen where the panels are mounted.

Not touched: `vite.config.ts`, service worker config, `PWAUpdateBanner.tsx`, `ErrorBoundary.tsx`, `ErrorFallback.tsx`, `globalErrorHandlers.ts`, `chunkError.ts`, `sentryContext.ts`, `useEngineerJobs.ts`, `Schedule.tsx`, and all backend/Supabase/Edge Function code.

## Verification
- Unit tests for the retry predicate (no retry on 4xx/RLS, one retry on network error) and the loader timeout helper.
- Manual: throttle to Slow 3G / offline mid-load on JobDetail and ServiceReceipt in **both** tenants and confirm the error panel appears and Retry recovers.
- Manual: confirm the Office dashboard paints today's schedule before analytics panels, and that no console errors or duplicate sends appear.
- Risk: moderate — QueryClient defaults are global, so I'll click through Schedule, Parts, Settings, Quotes and the Engineer app to confirm nothing depended on `staleTime: 0` or focus refetching.
