# Step 3 — Make Failures Visible

## What I found

- **Sentry**: initialised in `src/main.tsx` with a DSN and `tracesSampleRate: 0.2`. No `integrations`, no `beforeSend`, no tags, no release. It captures route only as part of the URL, and nothing about online state or the service worker.
- **Root boundary**: one `Sentry.ErrorBoundary` in `main.tsx` whose fallback is the bare text `An error has occurred` — no way to recover except closing the tab.
- **Route boundaries — asymmetric**: `src/components/shared/ErrorBoundary.tsx` exists but is used on exactly **one** route (`/dashboard`). Every other Office route (jobs, customers, finance, schedule, settings, quotes, warranty, insights…) and **every** Engineer route (`/engineer/*`) is unprotected — a crash there falls through to the bare root fallback.
- The existing `ErrorBoundary` never reports to Sentry (no `componentDidCatch`), and its only recovery action is a hard redirect to `/dashboard`, which is wrong for engineers.
- **No global handlers**: nothing listens to `window.onerror` or `unhandledrejection`, so async failures outside React render are invisible.
- **No chunk-error handling**: routes are all `lazy()`-loaded, so a stale tab after a deploy fails with "Failed to fetch dynamically imported module" and currently shows only the root fallback text.

## Plan

### 1. Upgrade the shared route boundary (`src/components/shared/ErrorBoundary.tsx`)

- Add `componentDidCatch` reporting to Sentry with the component stack, so route crashes are captured with context.
- Detect chunk-load failures (`ChunkLoadError`, `Failed to fetch dynamically imported module`, `error loading dynamically imported module`, `Importing a module script failed`) and perform **exactly one** reload, guarded by a `sessionStorage` flag so a persistently broken chunk shows the fallback instead of looping.
- Improve the fallback: keep "Something went wrong", add a "Try again" action that resets the boundary in place, and make the secondary navigation destination context-aware (engineer routes go back to `/engineer`, everything else to `/dashboard`) instead of always `/dashboard`.
- Accept an optional `name` prop so Sentry events say which area failed.

### 2. Apply boundaries at the two layout levels (`src/App.tsx`)

Rather than wrapping ~45 routes individually, wrap `<Outlet />` inside the two layouts — this covers every child route with two edits and keeps the chrome (nav, bell, banners) alive when a screen crashes:

- `src/components/layout/AppLayout.tsx` — wrap `<Outlet />` (line ~251) in the boundary.
- `src/components/engineer/EngineerLayout.tsx` — wrap `<Outlet context={engineerJobs} />` (line ~174) in the boundary.
- In `App.tsx`, keep the existing `/dashboard` boundary or drop it as redundant (it becomes nested), and add the boundary around the standalone routes that have no layout: `/auth`, `/reset-password`, `/quote/:id` acceptance, and the public receipt/redirect pages.
- Add a `key` from the current pathname so navigating away from a crashed screen clears the error state.

### 3. Global error reporting (`src/lib/globalErrorHandlers.ts`, new)

One small module, called once from `main.tsx`:

- `window.addEventListener('error', …)` and `window.addEventListener('unhandledrejection', …)` → `Sentry.captureException`.
- Same chunk-error detection as the boundary, sharing one helper so the "one reload per session" budget is shared between React and global handlers.
- Ignore benign noise (aborted fetches, extension-origin errors) so the signal stays readable.

### 4. Sentry context (`src/main.tsx` + a small `sentryContext` helper)

Extend the existing `Sentry.init` — no new dependency:

- Add `Sentry.browserTracingIntegration()` so route/navigation context is recorded properly (currently absent), and keep `tracesSampleRate` as-is.
- `beforeSend` enriches every event with tags: `route` (current pathname), `online` (`navigator.onLine`), `sw_state` (`none` / `active` / `waiting`, read from the existing registration — read-only, no changes to the service worker or `PWAUpdateBanner`), and `app` (`engineer` vs `office`, derived from the path).
- Replace the root fallback text with the same minimal fallback UI used by the route boundary, so no failure path ends in a blank screen.

## Verification

- Unit tests for the chunk-error detector and the once-per-session reload guard.
- Manual: force a throw in an Office screen and an Engineer screen and confirm nav/chrome survives and the fallback renders.
- Sentry tag enrichment and real chunk-load recovery need a **production deploy** to confirm; a stale-tab chunk failure cannot be reproduced in preview.

## Files touched

`src/components/shared/ErrorBoundary.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/engineer/EngineerLayout.tsx`, `src/App.tsx`, `src/main.tsx`, plus two new small files under `src/lib/` (global handlers + chunk-error helper) and their tests. Nothing in `vite.config.ts`, the service worker config, `PWAUpdateBanner.tsx`, or any backend/Edge Function code.
