# Step 2: Service Worker Update Safety

## Goal
Prevent a newly deployed service worker from taking over automatically, clean up stale caches, and keep old JS/CSS chunks loadable for tabs that are open during a deployment.

## Changes

### 1. `vite.config.ts` — workbox options

Current workbox block contains:

```text
skipWaiting: true,
clientsClaim: true,
```

Change to:

```text
// skipWaiting and clientsClaim intentionally omitted so the new SW waits
// until the user confirms via the in-app update banner.
clientsClaim: true,
cleanupOutdatedCaches: true,
```

Add a runtime-caching entry for built assets:

```text
{
  urlPattern: ({ request }) => request.destination === "script" || request.destination === "style",
  handler: "StaleWhileRevalidate",
  options: {
    cacheName: "assets",
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
    },
  },
},
```

### 2. `src/components/pwa/PWAUpdateBanner.tsx` — activation confirmation

Current banner already calls `updateServiceWorker(true)` when the user taps "Refresh". This posts the skip-waiting message to the waiting worker, so no change is required unless the read shows otherwise.

## Verification

- Run the build and confirm no typecheck or build errors.
- Inspect the generated `dist/sw.js` to confirm `skipWaiting` is no longer forced and the `assets` cache entry exists.

## Deployment Note

The final behaviour — old tabs loading their own chunks during a deploy and the banner correctly activating the new version — can only be confirmed after a real deployment and a subsequent version bump. This plan covers code changes only; the live-tab test is a separate step.
