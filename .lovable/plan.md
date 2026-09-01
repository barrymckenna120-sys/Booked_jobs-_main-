# Jobs list — 1,128 requests on Slow 3G: root cause and fix plan

## What the code actually shows (verified now, read-only)

The Jobs list itself is **not** doing N+1 per-row fetching. `src/pages/Jobs.tsx`
does exactly three queries per load, all batched:

1. `service_calls.select("*")` — every job, no date range, no limit
2. `customers.select(...).in("id", customerIds)` — one batched call
3. `quotes.select(...).neq("status","Draft")` — every non-draft quote, no limit

The table and mobile card renderers (lines ~296-520) contain no queries at all.
So the "one request per row" reading isn't what's happening — but several other
things are, and together they plausibly produce the numbers you saw.

Confirmed contributors:

- **Unfiltered realtime refetch storm.** `Jobs.tsx` subscribes to *all*
  `service_calls` changes and calls the full `fetchJobs()` (3 heavy queries) on
  every event, with no debounce. `Schedule.tsx`, `IncomingJobs.tsx` and
  `useEngineerJobs` each have their own equivalent subscription.
- **Uncapped retry loop.** `fetchJobs()`'s `catch` does
  `setTimeout(() => fetchJobs(), 5000)` with no attempt cap and no abort of the
  in-flight requests. On Slow 3G, requests that time out or abort re-enter this
  loop indefinitely — each cycle is 3 unbounded queries.
- **Unbounded payloads.** `select("*")` over all jobs plus all non-draft quotes
  is the biggest part of the transferred bytes, and the whole array is then
  JSON-stringified into localStorage on every load.
- **Preflight doubling is expected, not a bug per se.** Supabase REST calls
  carry `apikey`/`authorization` (and, in superadmin View As, an extra
  impersonation header from `orgHeaderInterceptor.ts`), so each distinct request
  is preceded by an `OPTIONS`. Reducing request *count* is what halves the
  preflights — there is no way to strip them.
- **Background polls in the shell:** parts badge every 30s (`AppLayout`),
  Live Activity 30s, Renewals card 60s, Parts page 30s.
- **`job_media` is not queried by the Jobs page.** It is queried by
  `Schedule.tsx`, `IncomingJobs.tsx`, `useEngineerJobs` and the media
  components. If you saw `job_media` traffic while on `/jobs`, it came from
  another screen in the same DevTools session (or a prior navigation), not from
  the jobs list.
- **Service-worker precache.** `vite.config.ts` precaches
  `**/*.{js,css,html,ico,png,svg,woff2}` and there are ~50 lazily-loaded route
  chunks plus vendor chunks and icons. On a first/updated load this fires a
  large batch of asset requests in the background — the most likely explanation
  for "20.1 MB resources" and a 5.3-minute *finish* time while the load event
  was only 12.76s.

## Diagnosis status

Root cause is **multi-source, and the exact split is not yet proven**. Nothing
in the code supports a per-row N+1 on this page, so before changing behaviour I
want one instrumented capture that attributes the 1,128 requests by URL group
(precache vs REST vs realtime vs polling). That is step 0 below and it is
cheap.

## Proposed fix order

### Step 0 — Attribute the traffic (no code changes)
Reproduce on the published site with a request log grouped by URL and initiator,
distinguishing service-worker precache requests from page requests. Output: a
table of counts per group. This confirms or kills each cause above before any
code moves.

### Step 1 — Quick wins on the Jobs page (small, low risk)
- Debounce the realtime handler (e.g. 1-2s trailing) and re-fetch only the
  changed job where possible instead of the whole page.
- Cap the retry loop (max 2 attempts with backoff, reuse `shouldRetryQuery` /
  `queryRetryDelay` from `src/lib/queryDefaults.ts`) and surface an error state
  instead of retrying forever.
- Replace `select("*")` with the ~30 columns the page actually renders, and
  bound the query (default to non-completed plus a recent window; completed
  history already has its own pagination in the UI).
- Fetch quotes only for the jobs on screen (`in("converted_job_id", ids)` /
  `in("job_id", ids)`) instead of the whole non-draft quote table.

Expected effect: request count on this page drops to a small constant, and
transferred bytes fall sharply. This is the "quick win" half.

### Step 2 — Narrow the precache (separate, needs a real deploy to verify)
Restrict `globPatterns` so the entry chunks, CSS and icons are precached and
the ~50 route chunks are left to the existing `/assets/` runtime CacheFirst
rule. This is what turns a 20 MB first load into a small one. Note: you
previously asked me not to touch `vite.config.ts` / service-worker config, so
this step stays separate and only goes ahead if you explicitly approve it.

### Step 3 — Same pattern elsewhere (follow-up)
`Schedule.tsx` and `IncomingJobs.tsx` share the unfiltered-subscription and
wide-`select` shape. Fix after Step 1 is verified, one screen at a time.

## Size estimate

- Step 0: minutes.
- Step 1: quick win — one file, ~4 contained changes, no schema or payment
  logic touched.
- Step 2: one config line, but deploy-gated verification.
- Step 3: bigger piece of work, and `Schedule` feeds booking/scheduling, so it
  needs the full process rather than a lite review.

No database writes and no payment-path changes in any step.
