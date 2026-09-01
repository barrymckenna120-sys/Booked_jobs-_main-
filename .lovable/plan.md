# Jobs list — Step 0 traffic attribution (measured) and revised fix plan

## Step 0 results

### A. The Jobs page's own data fetching is fine — no N+1

Measured a full authenticated reload of `/jobs` (superadmin session, local
preview, 45s settle) and grouped every request:

```text
223 total requests on reload
 189  dev-only ES module requests (129 /src, 60 node_modules) — does not exist in production
  19  Supabase REST/auth calls
  15  third party (Sentry, GA/GTM, fonts, Firebase config, Cloudinary, tagger)
```

Of those 19 Supabase calls, the Jobs list itself made exactly **three**:
`service_calls`, `customers` (batched `in`), `quotes`. **Zero per-row requests.**
The original N+1 reading is confirmed dead.

### B. Real duplication does exist, but it's the app shell, not the list

Same capture, repeated identical calls per single page load:

```text
7x  GET /rest/v1/profiles?select=role&user_id=eq...
2x  GET /rest/v1/profiles?select=organisation_id,role
2x  GET /auth/v1/user
2x  HEAD /rest/v1/parts_requests (nav badge)
2x  GET /rest/v1/engineers
```

Your live network snapshot shows the same shape on the hosted app, plus
`notifications` GET **and** HEAD firing 4x each in a burst. These come from
multiple independent consumers of role/notification hooks mounting together,
not from the jobs table. Every one of these also pays an `OPTIONS` preflight —
that is the "doubling" you saw.

### C. The dominant cause of the byte and request volume: service-worker precache

Read the deployed `sw.js` on `kngasservices.bookedjobs.ie` and sized every
precached file:

```text
158 precached files: 137 .js, 14 .png, 3 .html, 2 .ico, 1 .svg, 1 .css
8.75 MB compressed  (~20 MB uncompressed — matches your 20.1 MB "resources")

Largest entries:
  2.13 MB  images/plumber-hero.png            (marketing landing page)
  1.80 MB  images/google-profile-before-after.png (marketing)
  1.51 MB  assets/engineer-van-tablet-*.png   (marketing)
  0.89 MB  assets/whatsapp-reminder-mockup-*.png (marketing)
  0.38 MB  assets/missed-call-cost-*.png      (marketing)
  0.32 MB  assets/spreadsheet-*.js            (xlsx, only used by import/export)
  0.31 MB  assets/index-*.js
```

So on a first load or after any deploy, the browser downloads all 158 files in
the background regardless of which page you opened. **~7 MB of that is
marketing-site imagery that no engineer or office user ever sees.** On Slow 3G
this is exactly the profile you reported: load event at 12.76s (the app itself),
then a 5.3-minute "finish" as precache drains, with hundreds of requests.

### D. What is still unattributed

Precache (158) + app-shell REST + preflights + fonts/analytics accounts for a
few hundred requests, not 1,128. The remaining volume is most likely Slow 3G
retries/aborts feeding back into two loops that are in the code:

- `Jobs.tsx` `catch` → `setTimeout(() => fetchJobs(), 5000)`, uncapped, with no
  abort of in-flight requests. Each cycle is 3 unbounded queries.
- `Jobs.tsx` subscribes to **all** `service_calls` changes and re-runs the whole
  `fetchJobs()` on every event, no debounce. `Schedule.tsx`, `IncomingJobs.tsx`
  and `useEngineerJobs` each have their own copy of this pattern.

I could not reproduce a 1,128-request run on a healthy connection, so I am not
claiming these loops as proven — they are the only mechanisms in the code that
can multiply requests without bound, and throttled verification is part of
Step 1's acceptance check.

## Revised fix plan

### Step 1 — Narrow the precache (biggest single win, config-only)
Precache only the app entry chunk, CSS, `index.html` and the PWA icons; let the
existing `/assets/` runtime CacheFirst rule pick up route chunks on demand, and
exclude the marketing images entirely. Turns ~20 MB / 158 files into a few
hundred KB on first load.

This means editing `vite.config.ts` / workbox config, which you previously told
me to leave alone — so it needs your explicit go-ahead, and it needs a real
deploy plus one offline check to verify.

### Step 2 — Jobs page hardening (quick win, one file)
- Cap the retry loop (2 attempts, backoff via `src/lib/queryDefaults.ts`) and
  show an error state instead of retrying forever.
- Debounce the realtime handler (1-2s trailing) instead of full refetch per event.
- Replace `select("*")` with the columns actually rendered, and bound the query.
- Fetch quotes only for the jobs on screen instead of the whole quote table.
Verified under DevTools Slow 3G before and after.

### Step 3 — De-duplicate the shell reads (small, high signal)
Fold the repeated `profiles?select=role` / `organisation_id` reads and the
duplicated notification GET+HEAD burst into shared cached queries, the same way
`useUserRole` was already fixed. Target: 1 role read and 1 notification read per
load instead of 7 and 4.

### Step 4 — Same pattern on other screens (follow-up)
`Schedule.tsx` and `IncomingJobs.tsx` share the unfiltered-subscription and
wide-`select` shape. `Schedule` feeds booking/scheduling, so it gets the full
process, not a lite review.

## Effort

- Step 1: one config change, quick win, but deploy-gated verification.
- Step 2: quick win, one file, contained.
- Step 3: small, touches shared hooks — needs an office-account regression pass.
- Step 4: bigger piece of work.

No database writes and no payment-path changes in any step.
