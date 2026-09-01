# Offline reload: why you saw Chrome's Dino page

## What you observed is expected with the current config — but it means offline navigation is not actually covered

Two separate things explain it.

1. **App routes are explicitly excluded from service-worker navigation handling.** The current service-worker config lists every real app path (`/`, `/dashboard`, `/engineer`, `/jobs`, `/customers`, `/quote`, `/admin`, `/auth`, `/certificates`, `/pdf`, `/b`, ...) in both the navigation-fallback denylist and the navigation runtime-cache rule. So when you reload `/dashboard` offline, the service worker deliberately does not answer the navigation — it goes straight to the network, the network is off, and Chrome shows its own error page. `offline.html` is precached but nothing is wired to serve it, so it can never appear.
2. **Service workers only run on the published site.** In Lovable preview / iframe hosts registration is refused (and any existing worker is unregistered), so an offline reload there always gives the Dino page regardless of config. Only `karlsgas.lovable.app`, `kngasservices.bookedjobs.ie` and `dublin-gas.bookedjobs.ie` register `/sw.js`.

So: Step 1 (precache narrowing) is still verifiable, but not via an offline reload — that test measures a behaviour the app was never configured to have.

## What to test instead (reflects real-world usage)

Run all of this on the published domain, normal tab, not the editor preview.

**A. Confirm Step 1 actually shipped (this is the thing you wanted to confirm)**
1. Load the app online, hard-reload once so the new worker installs and activates.
2. DevTools > Application > Cache Storage > the `workbox-precache` bucket: expect roughly **10 entries** (index.html, offline.html, entry JS/CSS, manifests, favicon, 3 icons) instead of ~158.
3. DevTools > Network on a fresh profile: first load should no longer show a long tail of precache fetches for marketing images and route chunks.

**B. Connection lost while the app is already open (the realistic engineer case)**
1. App open and signed in online, visit a couple of pages so their chunks land in the `assets` cache.
2. Set Offline, then navigate in-app (client-side links only, no reload).
3. Expected: already-loaded screens keep working from React state/cache; new data reads fail and surface the app's own error/retry states. Route chunks resolve from the `assets` cache.

**C. Hard reload while offline**
Expected today: browser error page. This will stay the case until we decide to serve a fallback (below).

## Optional follow-up — decide separately

If you want an offline reload to show the app's own offline screen instead of Chrome's, that is a change to the service-worker navigation rules: give the denied navigations a `NetworkOnly` handler with a precached `offline.html` fallback, so online behaviour is byte-for-byte unchanged (still always network for app routes) and only the failure case changes.

Trade-off worth naming: this is a service-worker config change and needs your explicit go-ahead, because the deny-everything design was chosen on purpose so auth, OAuth, PDF and short-link routes are never answered from a cached shell. Serving `offline.html` on failure does not reintroduce cached-HTML staleness, but it does need one verification pass per tenant domain after deploy.

## Recommendation

Close Step 1 using test A only. Treat "offline reload shows the app's offline page" as a separate, small piece of work, scoped and approved on its own — same handling as Step 4.

## Technical detail

- `vite.config.ts` > `VitePWA.workbox`: `navigateFallbackDenylist` and the navigation `runtimeCaching` entry both filter out all app path prefixes, so no navigation request for a real route reaches a Workbox handler.
- `public/offline.html` is precached by the current `globPatterns` but is not referenced by any handler or `navigateFallback` path.
- Registration is gated by `shouldSkipServiceWorker()` in `src/lib/isPreviewHost.ts`, used by `src/main.tsx` and `src/components/pwa/PWAUpdateBanner.tsx` (`useRegisterSW`, `registerType: "prompt"`). Preview hosts unregister instead of registering.
- No code changes are proposed in this plan.
