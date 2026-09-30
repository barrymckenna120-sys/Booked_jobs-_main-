# Jobs page flash of 4 old jobs: read-only findings

No changes made. These findings come from reading the code. I have not reproduced the flash in your browser.

## 1. Where the first render gets its data
- **Local jobs cache (the cause).** `src/pages/Jobs.tsx:147-160`: `fetchJobs()` reads `localStorage["bookedjobs_jobs_cache"]` and renders it straight away (`setJobs(parsed.jobs)`, `setLoading(false)`). Then it fetches from the server and replaces the list (`:163-167`, `:222`). It writes the new list back to the cache at `:224-229`.
- It skips the cache only when `adminViewingOrgId` is set (`:148-151`).
- The cache has no age limit and no org check. `cachedAt` is written but never read.
- React Query `initialData` / `placeholderData` / `keepPreviousData`: none in `src`.
- Persisted query cache (`persistQueryClient`, IndexedDB, idb-keyval): none. The QueryClient in `src/App.tsx:101-112` lives in memory only.
- Service worker (`vite.config.ts:87-140`): caches only page navigations (NetworkFirst, `/rest` excluded) and `/assets/` (CacheFirst). Data requests are never cached.
- The same pattern exists elsewhere: `src/hooks/useEngineerJobs.ts:119,235` (`bookedjobs_engineer_jobs_cache`) and `src/pages/Customers.tsx:180,208`.

Likely match, not confirmed: "4 old jobs" fits KN-001 to KN-004, which were deleted from TEST K&N in last night's clear. This browser's cache would still hold them until the first successful fetch rewrites it. That first successful fetch is exactly the "~1 second then gone" you see. To confirm, look at `bookedjobs_jobs_cache` in the affected browser's localStorage.

## 2. Is the cache scoped by organisation_id?
No. The key is the fixed string `bookedjobs_jobs_cache` (`Jobs.tsx:147`), and the payload holds no org id. Any user of any org on the same browser profile gets the previous list for a moment.
- The jobs list doesn't use React Query. The only query on the page (job engineers, `Jobs.tsx:~95-110`) is keyed by job ids, not org.

## 3. Load order: headers and org resolution
```text
main.tsx:17   installOrgHeaderInterceptor() patches fetch before React mounts
              (token/org read from localStorage at module load, orgHeaderInterceptor.ts:12-21)
useOrgId      getSession -> fetchProfile -> ready=true   (useOrgId.ts)
Jobs.tsx:116  when user && ready -> fetchJobs()
  :150-160    cache rendered (no network)   <- the flash
  :163        service_calls request (the interceptor adds x-org-impersonation-token /
              x-org-id when viewing as another org, :85-99)
  :222        server list replaces the cache
```
The server request is gated on `ready` and goes out after the interceptor is installed, so it isn't sent before the header. The flash happens before any request, from local storage alone.

## 4. Clearing on org switch / logout
- **Org switch** (`useAdminViewAs.tsx:121-126`): removes `"bookedjobs_jobs_cache_" + <previous org>`. That key never exists, because the real key has no suffix. So the jobs cache is **not** cleared. It then reloads the page (`:136`).
- **Exiting view-as** (`useAdminViewAs.tsx:~137-148`): clears nothing; it only reloads.
- **Logout** (`useAuth.tsx:209-228`): signs out and redirects. No localStorage cache is removed and the React Query cache isn't cleared. The in-memory cache does go when the page reloads.
- Nothing in `src` calls `queryClient.clear()`, `removeQueries` or `resetQueries`.

## Suggested next steps (for a separate, approved change)
1. Scope the cache key by org and user, check the org before rendering, and add an age limit. Or drop the cache for the office Jobs list.
2. Fix the wrong key in `useAdminViewAs.tsx:123`, and clear all `bookedjobs_*` caches on logout and when exiting view-as.
3. Add a regression test that a cache from org A never renders for org B.
