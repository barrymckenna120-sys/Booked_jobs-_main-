# BookedJobs reliability — recommended fix order

Audit complete (see chat report). This is the sequencing only. Nothing is
implemented yet, and each step below is a separate approval.

## The five biggest problems, in the exact order to fix them

### Step 1 — Stop the service worker serving backend data across sessions
Remove the `supabase-api` REST entry from `runtimeCaching` in `vite.config.ts`.
It is keyed on URL alone, so it can hand one user's or one tenant's rows to
another session for up to 5 minutes — and on weak 4G the 5-second timeout that
triggers it fires routinely. Highest severity, smallest diff. No offline
regression that matters, because there is no deliberate offline layer yet.

### Step 2 — Make app updates safe
Drop `skipWaiting` and `clientsClaim` so the update banner actually controls
activation, add `cleanupOutdatedCaches`, and add a runtime cache for `/assets/`
so a stale tab can still resolve an old chunk. This is what produces white
screens and failed chunk loads after every deploy. Needs a real deploy to
verify, so it ships on its own.

### Step 3 — Make failures visible
Wrap every route in an error boundary (only `/dashboard` has one today), add
global `error` and `unhandledrejection` handlers, and tag Sentry with release,
current route, online state and service-worker state. Handle `ChunkLoadError`
with a one-shot reload. Until this lands, no white-screen report can be
diagnosed.

### Step 4 — Calm the network
Set `QueryClient` defaults (`staleTime`, `retry: 1` with backoff,
`refetchOnWindowFocus: false`), fix the two loaders that can never clear
(`JobDetail`, `ServiceReceipt`), and defer non-essential startup queries per the
startup classification in the report. Biggest single weak-4G improvement.

### Step 5 — Make engineer writes safe
Add in-flight locks, keep completion forms mounted until the write confirms,
retain typed data on failure, and make the completion sequence atomic (or queue
every sub-step, not just the main patch). Largest and riskiest change, so it
goes last with its own test pass.

## Then, separately
- Photo thumbnails and lazy loading on the engineer job list.
- Unbounded `Schedule` and engineer job queries; narrow `select("*")`.
- Consolidate the two connectivity implementations; fix the retry queue's silent
  drop after three attempts.
- Office-side local cache for today's schedule.
- `100dvh` cleanup, production log removal, error-boundary redirect by role.

## Notes
- Steps 1-3 are independent and could be reordered, but 1 is a data-exposure
  issue so it goes first.
- Step 5 touches job completion, which is critical-path — it needs the full
  process, not a lite review.
- No database writes are involved in any step.
