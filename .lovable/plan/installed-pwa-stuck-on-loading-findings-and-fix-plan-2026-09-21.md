# Installed PWA stuck on loading — findings and fix plan

## What the code actually shows (verified by reading, not assumed)

1. **Last week's timeout fixes are in the code, but they can only help once the phone is running the new code.** `resolveLandingPathSafe` (bounded, falls back to `/engineer/today`), the 25-second ceiling on the loading screen (`RouteFallback` in `src/App.tsx`), and the bounded session check in `useAuth` all live inside the app bundle. They apply identically to the browser and the installed icon — there is no separate startup path for standalone mode. So if the installed app hangs forever with no "Connection problem" message after 25 seconds, it is **not running the new bundle**.

2. **Nothing recovers the app before its own code loads.** `index.html` renders an empty container and then loads the app bundle; there is no watchdog outside the bundle. If the cached startup files are stale or a file the page needs cannot be fetched, there is no timer, no message and no way out — the screen just sits there.

3. **The installed app and Safari keep separate caches and separate background workers on iOS.** That is exactly the split observed: Safari revalidates and picks up the new release, while the installed icon can keep launching from its own older cached copy. Only two things can replace that copy: a fresh successful download, or the waiting new version being activated.

4. **Activation depends on code that the stale copy does not contain.** The new "activate a waiting version at cold launch" logic (`src/lib/swColdStart.ts`, used by `PWAUpdateBanner`) shipped last week. A phone still launching last month's cached copy has none of it, and the older copy only offered an update banner — which was hidden on the login screen. That is a self-lock: the stale install cannot adopt the fix that would un-stale it.

5. **Only the entry files are pre-stored.** `vite.config.ts` pre-stores `index.html` plus `assets/index-*.js/css`; the shared vendor bundle and every screen are fetched on demand (cached after first use). A cached page that points at files the phone has never fetched will hang on a weak connection until something times out — and today nothing does, before the bundle loads.

**Unconfirmed:** which of (4) or (5) is actually biting Karl's phone. Both produce the same symptom, and the device is the only place to tell them apart. Diagnostics below are part of the fix, not a separate exercise.

## Fix plan, prioritised

### P1 — Escape hatch outside the app bundle (the actual unblock)
Add a small inline watchdog to `index.html`:
- the app signals "I started" as soon as it renders;
- if that signal has not arrived after ~8 seconds, show a plain recovery screen: "BookedJobs couldn't start" + a **Reset app** button;
- Reset clears the installed app's stored copy of BookedJobs, removes the app-shell background worker (leaving the push-notification worker alone), and reloads once — reload budget kept in session storage so it can never loop;
- after ~20 seconds with still no signal, run that recovery automatically, once.

Because this lives in the page itself and not in the bundle, it works even when the bundle is the broken part. Once a device picks up this release, every future stale-install is self-healing.

### P2 — Make a stale install adopt a new release reliably
- Pre-store the shared vendor bundle alongside the entry files so a cached page never points at a file the phone has never downloaded.
- Keep the cold-launch activation from last week, and additionally check for a newer version once at launch rather than waiting for the browser's own schedule.
- No change to offline behaviour, the fonts fix, the "Load failed" login fix, routing, auth, database or backend.

### P3 — Evidence from Karl's phone (while the broken install is preserved)
- Reset is a button the user presses, so the broken install stays intact until Karl chooses to use it.
- Meanwhile: opening the app once with `?sw=off` appended forces a clean load and confirms whether the stale cache is the cause, without deleting the icon.
- Sentry already tags `display_mode` (standalone vs browser) and background-worker state, so the next failure from the installed app is identifiable; the watchdog will also report when it fires, with how long it waited.

### P4 — Roll-out check before Karl
Verify on a real iPhone: install from the published app, confirm normal cold launch is unaffected; then simulate a stale install (weak signal / airplane-mode toggling) and confirm the recovery screen appears and Reset restores the app. Offline launch of an already-loaded app must still work.

## Technical notes
- Files touched: `index.html` (inline watchdog + boot signal), `src/main.tsx` (one line to emit the signal), `vite.config.ts` (pre-store the vendor bundle; one extra update check), plus a small unit-tested module for the recovery decision (elapsed time, one-shot budget, storage-unavailable refusal) mirroring the existing `swColdStart` pattern.
- Cache clearing is scoped to this app's own stored copies; the Firebase push worker and its storage are untouched.
- Tests: watchdog fires after the ceiling, does not fire when boot signals in time, recovers at most once per session, refuses when session storage is unavailable.
- Full test suite, type check and production build run before publishing. The service worker only runs on the published app, so final confirmation is a real-device check after publish.

## Risk
P1 is additive and cannot affect a healthy launch (the signal arrives in well under a second). P2 slightly increases first-load download size. Both change launch behaviour for every live user, so they ship together with the device check in P4 and nothing else bundled in.
