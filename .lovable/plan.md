## Audit findings (src/pages/Jobs.tsx, fetchJobs lines 89–159)

The fetchJobs function itself is structurally fine — it queries `service_calls`, hydrates customers, and calls `setJobs(jobs)`. Nothing in the recently added cache logic clears React state or short-circuits the fetch:

- Line 91: `CACHE_KEY = "bookedjobs_jobs_cache"` (original, correct)
- Lines 93–96: `isAdminViewing` block only calls `localStorage.removeItem(...)`. It never touches `jobs` state and never returns early.
- Lines 99–106: cache read only calls `setJobs` when a cache exists; harmless when empty.
- Lines 108–153: fetch + `setJobs(jobs)` runs unconditionally after that.

So the cache changes cannot be the cause of "no jobs for any org". The empty list is almost certainly coming from the Supabase query itself returning `[]` under RLS — consistent with the console error `[impersonate-org] mint failed … Failed to fetch`. When mint fails, the interceptor falls back to the raw `x-org-id` header, but `get_my_org_id()` on the server no longer accepts that raw header (only the signed token), so queries filter to an empty tenant for the superadmin session. Regular users signed into the same browser can also be affected if a stale `adminViewingOrgId` is still in localStorage — the interceptor will attach headers on their requests too.

However: the user asked me to **fix `src/pages/Jobs.tsx` only**. Within that scope, the safe, minimal change is to remove the admin cache-clear block we added (it's already handled inside `useAdminViewAs.setViewingOrg` before reload, so it's redundant here) and additionally guard the cache read so a stale `adminViewingOrgId` in localStorage on a regular user's browser cannot cause cross-tenant cache display.

## Planned change (Jobs.tsx only)

Replace lines 91–106:

```ts
const CACHE_KEY = "bookedjobs_jobs_cache";

const isAdminViewing = !!localStorage.getItem("adminViewingOrgId");
if (isAdminViewing) {
  localStorage.removeItem("bookedjobs_jobs_cache");
}

try {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    setJobs(parsed.jobs || []);
    setCustomersMap(parsed.customersMap || {});
    setLoading(false);
  }
} catch (e) {}
```

with:

```ts
const CACHE_KEY = "bookedjobs_jobs_cache";
const isAdminViewing = !!localStorage.getItem("adminViewingOrgId");

// Only read cache for regular users. Admins viewing another org must
// wait for a fresh fetch to avoid showing the previous tenant's data.
if (!isAdminViewing) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      setJobs(parsed.jobs || []);
      setCustomersMap(parsed.customersMap || {});
      setLoading(false);
    }
  } catch (e) {}
}
```

Result:
- Regular users: cache read as before → cached data shows on weak signal, then Supabase fetch replaces it. Behaviour unchanged.
- Admin View-As: no cache read, no cross-tenant leak. Cache clearing on switch remains handled in `useAdminViewAs.setViewingOrg` (not touched).
- The fetch itself is unchanged, so if jobs are still empty after this, the cause is the impersonation-token mint failure surfaced in the console — that lives outside Jobs.tsx (edge function + interceptor) and would need a separate fix.

No other files changed.