# Dashboard startup: investigate the pre-data delay

## What the measurements show so far

Two throttled runs (~400 kbps, 400 ms latency) against the running app:

- The deferred-mount logic is intact and working. Today's Schedule module loads eagerly; Jobs Update and Today's Revenue modules only load after the idle gate, and their data queries fire 2.4 s and 4.0 s *after* the schedule's query. The stagger is real, just compressed below perceptual threshold by the multi-second network wait.
- Before any data request goes out, the app pulls **187 separate JavaScript module requests** from the dev server, spread over roughly 10 s on that throttle. That is what the ~14 s pre-data gap is made of — module transfer, not auth logic or blocking queries.

Important caveat: the environment tested is the Vite dev server, which serves every source file as its own unbundled module. A published build collapses those into a handful of hashed chunks. The 171-request / 3.6 MB figure from the Slow 3G test closely matches this dev pattern, which suggests that test ran against the preview rather than the published app — so part of the measured startup cost may not exist for real users at all.

## Plan

### 1. Establish the honest baseline (production build)

Produce a production build and measure the same journey on the same throttle, capturing:

- request count and transferred bytes before the first data request
- time to the first data request
- which chunks are on the critical path to the Dashboard, and their sizes

This decides whether there is a real startup problem or a dev-server artifact. No code changes in this step.

### 2. Report the split

State plainly how much of the pre-data delay survives in production, and what the remaining critical path is (entry chunk, vendor chunk, route chunk, auth round-trips).

### 3. Only then, propose targeted fixes

Candidates, to be confirmed by the step-1 numbers rather than assumed:

- Trim what the entry bundle pulls in eagerly. `src/App.tsx` currently imports `Auth`, `Index`, `AppLayout`, `EngineerLayout`, `DevConsole`, the toasters, tooltip and WhatsApp providers, and the PWA banners at module scope, alongside ~50 lazy route imports.
- Reduce auth round-trips before the first data query if the timeline shows serial waits there.
- Split or defer heavy vendor dependencies that the Dashboard does not need for first paint.

Each fix ships as its own change with a before/after measurement.

### 4. Re-test staggering

With startup shortened, re-run the Slow 3G Dashboard test and see whether the schedule-first ordering becomes visible on its own. Only if it still is not do we revisit gating the secondary panels on the schedule's data rather than on an idle callback.

## Technical notes

- Measurement uses Playwright with CDP `Network.emulateNetworkConditions`, logging request timestamps relative to navigation start.
- No backend, schema, Edge Function, or query-logic changes are in scope.
- `useDeferredMount` and the `secondaryReady` gating in `src/pages/Dashboard.tsx` stay as they are for now — they are confirmed working.
