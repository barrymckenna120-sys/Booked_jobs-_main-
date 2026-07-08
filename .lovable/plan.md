## Objective
Remove two specific runtimeCaching handlers from `vite.config.ts` so the Workbox service worker no longer caches the `service_calls` and `engineers` REST endpoints with `StaleWhileRevalidate`.

## Changes
Edit `vite.config.ts` only:
- Delete lines 58–64 (the `supabase.co/rest/v1/service_calls` handler, `StaleWhileRevalidate`, `cacheName: "supabase-service-calls"`).
- Delete lines 66–72 (the `supabase.co/rest/v1/engineers` handler, `StaleWhileRevalidate`, `cacheName: "supabase-engineers"`).
- Leave the rest of the file unchanged, including the broader `supabase.co/rest` `NetworkFirst` handler and the navigation `NetworkFirst` handler.

## Verification
After editing, confirm:
1. `vite.config.ts` compiles and the Vite PWA plugin still generates a service worker.
2. No `StaleWhileRevalidate` handlers remain for `service_calls` or `engineers`.
3. The remaining runtimeCaching handlers are intact.

## Risk
Requests to these two endpoints will fall through to the broader `NetworkFirst` Supabase REST handler (5-second timeout, 50 entries, 5-minute max age). This removes the 24-hour stale-while-revalidate cache and may increase perceived load time or network dependency on weak signals.