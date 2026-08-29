# Browser verification of Steps 2-4

Goal: verify the PWA reliability work from a user's point of view with real browser runs, and report pass/fail per point with screenshots and console/network evidence.

One thing to settle before starting: two of the three steps cannot be tested against the sandbox preview as-is, and both need your go-ahead.

## What can and cannot be tested where

- **Step 3 and Step 4** can be tested in the sandbox against the running app (real login session already available). Full pass/fail achievable.
- **Step 2 (safe updates) cannot be tested in the sandbox at all.** The service worker is deliberately never registered in dev or preview (`shouldSkipServiceWorker` returns true when not a production build, in an iframe, or on a preview host). No worker means no waiting worker, no banner, nothing to activate. Verifying it needs two real publishes of the live app plus a browser session held open across them.

## Step 2 — safe updates (approved: publish live)

Requires publishing the app twice, against the live K&N domain, because that is the only place the worker runs. Approved to go ahead; scheduled for a quiet window (early morning / observed lull), and no step force-reloads anyone.

1. Publish once (baseline).
2. Open the published app in a real browser session, sign in, confirm a service worker is active.
3. Publish again with a trivial visible change.
4. On the same still-open tab: confirm the update banner appears, the app keeps working on the old version (navigate two screens, type into a form field and confirm the text survives), then tap Update and confirm a clean reload onto the new version.
5. Confirm old precache buckets do not accumulate across the two deploys.

The "trivial visible change" in step 3 is a one-line marker so the two builds are distinguishable; it is removed after the test.


## Step 3 — visible failures

Route boundaries exist on the app shell, the Office layout, the Engineer layout, and the two standalone Engineer routes. To make one screen crash on demand without shipping anything, I'd add a temporary, throw-on-query-param trigger (e.g. `?forceError=1`) in a single test-only helper used by one Office screen and one Engineer screen, run the checks, then remove it before finishing. That temporary edit is the only code change in this plan, and it does not stay in the codebase.

Checks, one Office screen and one Engineer screen:
- Fallback UI renders — not a blank screen. Screenshot each.
- "Try again" clears the boundary and the screen renders normally again.
- "Go back" routes per app: Engineer lands inside `/engineer`, Office lands on `/dashboard`.
- Shell survives: nav and notification bell still usable while the fallback is showing.
- Console captured for each run.

## Step 4 — calm the network

Using CDP network throttling (slow 3G profile, high latency) plus a request-blocking run to simulate a hung backend:

- **JobDetail**, for a K&N job and a Dublin Gas job: confirm it either loads or lands on the retry panel. Specifically confirm the loader always terminates — no spinner past the 15s timeout.
- **ServiceReceipt**, same two tenants: same check, plus confirm it fails loudly rather than rendering blank or unbranded when required data is missing.
- **Retry** from the error panel recovers once throttling is lifted.
- **Office Dashboard paint order**: on slow 3G, confirm Today's Schedule paints before Jobs Update and Today's Revenue appear, with timestamped screenshots and a request timeline as evidence.

Tenant note: Dublin Gas needs its own authenticated session to test tenant-scoped screens honestly. I'll mint one for a non-privileged Dublin Gas user rather than inferring parity from K&N.

## Output

A pass/fail line per bullet above, screenshots per check, and console/network notes. Anything that can't be verified is reported as unverified with the reason, not as a pass.

## Not in scope

No changes to app behaviour, service worker config, error-boundary code, query defaults, backend, schema, or Edge Functions. The only edit is the temporary Step 3 error trigger, removed before the report.
