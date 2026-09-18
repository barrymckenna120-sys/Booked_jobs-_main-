# Fix the permanent stuck-loading screen on weak signal

Two separate, independently reviewable steps. Step 3 from the findings
(storing engineer screens up front) is deliberately held until a real-device
test confirms these two resolve it.

Scope guardrails: no changes to sign-in, permissions, tenant separation,
data, queries or offline caching rules. Presentation and startup flow only.

## Step 1 — Time-limit the landing decision at the app's start address

When the installed app opens at "/", it asks the database whether the person
is an engineer or office staff before choosing their screen. Today that
question can hang forever and, if it fails, no destination is ever chosen —
the brand loader stays on screen with no error and no retry.

Changes:
- Give that question the same time limit the rest of the app already uses.
- If it cannot be answered in time (or errors), send the person to a safe
  default screen rather than leaving them on the loader. The default follows
  the existing least-privileged behaviour used elsewhere, so nobody gains
  access they would not otherwise have — the screen they land on still
  enforces its own permission checks.
- Keep the successful path byte-for-byte identical in behaviour.

## Step 2 — Give the loading screen a hard ceiling

Any remaining startup stall (for example a screen's code arriving over a dead
connection) currently shows "Loading..." indefinitely.

Changes:
- After a fixed wait, the loading screen swaps to a plain "Connection problem"
  state with a Retry button and, where relevant, a link back to the start.
- Retry reloads rather than guessing at partial state.
- Styling stays in the existing brand loader/error look; no new design.

## Technical notes

- Step 1: `src/lib/resolveLandingPath.ts` wrapped in `withRequestTimeout`
  (`src/lib/queryDefaults.ts`), plus a `.catch` in `RootRoute`
  (`src/App.tsx:160-184`) that resolves a fallback target so `target` can
  never stay `null`. Fallback mirrors `ENGINEER_FALLBACK` semantics in
  `useUserRole.ts`; route-level guards (`OfficeRoute`, RLS) remain the
  authority.
- Step 2: add an elapsed-time state inside `RouteFallback` (`src/App.tsx:187`)
  so both the auth gate and every `Suspense` fallback inherit the ceiling in
  one place; reuse `ErrorFallback`/`DataLoadError` visuals. Ceiling set above
  `REQUEST_TIMEOUT_MS` so a slow-but-working connection is never cut short.

## Verification

- Unit cover: landing path resolves the fallback on timeout and on rejection;
  loader flips to the retry state after the ceiling and not before.
- Full test suite, type check, production build.
- Playwright on a phone-sized production build: normal load, request-stalled
  load (no responses), offline relaunch, and reconnect — confirming no screen
  spins forever and the successful path is unchanged.
- Then a real-device retest on weak signal before reconsidering step 3.
