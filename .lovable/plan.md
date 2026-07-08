## Audit Finding — No Change Required

This was an audit-only request. Findings for `vite.config.ts`:

### 1. URL patterns matching `supabase.co`
- **Line 58**: `/^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest\/v1\/service_calls/` → `StaleWhileRevalidate` (cache: `supabase-service-calls`)
- **Line 66**: `/^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest\/v1\/engineers/` → `StaleWhileRevalidate` (cache: `supabase-engineers`)
- **Line 74**: `/^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest/` → `NetworkFirst`, 5s timeout (cache: `supabase-api`)

### 2. Is `/auth` or `/auth/v1` explicitly excluded?
No explicit exclusion exists, but all three supabase handlers are scoped to `/rest` — they do not match `/auth/v1/*`. There is no need for an explicit exclusion because no pattern reaches that path.

### 3. Catch-all handler for `supabase.co`
None. The broadest is line 74 (`/rest` prefix only). There is no wildcard `supabase.co` handler.

### `navigateFallback` / POST handling
- **Line 27**: `navigateFallback: "/offline.html"`, denylist lines 28–37 (includes `/^\/auth/` at line 32, `/^\/rest/`, `/^\/functions/`). Applies only to navigation requests.
- **Lines 40–50**: HTML navigation handler, guarded by `request.mode !== "navigate"` at line 41. GET navigations only.
- Workbox `runtimeCaching` matches only GET requests by default; no entry sets `method: 'POST'`.

### Conclusion
A POST to `https://<ref>.supabase.co/auth/v1/token` (i.e. `signInWithPassword`) is **not intercepted** by any Workbox handler, and `navigateFallback` never applies to POSTs. The service worker in `sw.js` is not the source of any auth POST hanging/failing.

No files to change.
