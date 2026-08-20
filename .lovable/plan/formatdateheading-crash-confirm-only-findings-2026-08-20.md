# formatDateHeading crash — confirm-only findings

## Step 1 findings (verified by search, not assumed)

`src/components/engineer/EngineerLayout.tsx` (238 lines) contains **zero** references to `formatDateHeading`, and zero references to a `greeting` helper. A repo-wide search returns only two hits, both in one file:

- `src/pages/EngineerApp.tsx:49` — `const formatDateHeading = (d: Date) => {...}` (definition)
- `src/pages/EngineerApp.tsx:166` — `{formatDateHeading(new Date())}` (call)

In that file both the definition and the call are present, and `greeting()` is likewise defined (line 42) and called (line 168), so that file cannot throw a `ReferenceError` either. `src/pages/EngineerApp.tsx` is also **not routed** — `src/App.tsx` mounts `EngineerLayout` at `/engineer` and never imports `EngineerApp`. It is dead legacy code carrying the old gradient/greeting header.

Commit `68d92963` ("Trimmed engineer header") touched only `EngineerLayout.tsx` (+4 / -33) and removed the greeting/date block cleanly — no orphaned call was left behind.

Conclusion: there is nothing in `EngineerLayout.tsx` to delete. The reported production error cannot come from the current code on this branch. The most likely explanation is that the crashing bundle is an **older deploy** (published build predating `68d92963`, or a cached service-worker/PWA bundle on the affected devices) — which also matches the symptom "new header isn't visibly rendering for some users/sessions even though it's deployed".

## Step 3 findings

No other dead helper calls remain in `EngineerLayout.tsx`. All identifiers used in its render path are either imported at the top or declared in-component.

## Proposed action

Since Step 2's fix does not exist, and scope is `EngineerLayout.tsx` only, the honest outcome is: no code change to that file.

Two follow-ups I can do on your say-so (each is a separate, minimal change):

1. **Republish** the app so the live bundle definitely includes `68d92963`, then confirm the compact header renders on all four engineer screens (Today, Upcoming, Completed, Parts) with screenshots.
2. **Delete `src/pages/EngineerApp.tsx`** (unrouted legacy screen holding the old gradient + greeting header) so no stale copy of that UI can be reached or re-imported by accident. Out of the stated scope, so only if you want it.

On Sentry: there is no Sentry integration in this project, so I cannot query the error signature. If the error text came from Sentry, the release/bundle hash on that event is the fastest way to confirm the stale-deploy theory.
