# Import Customers: `existingPhones is not defined`

## What I found (verified before writing this)

I searched the entire repository for `existingPhones` — including `src/pages/ImportCustomers.tsx`, all of `src/`, `supabase/`, and the whole project tree excluding `node_modules`:

- **Zero matches.** There is no `existingPhones` reference left in the source anywhere.
- `ImportCustomers.tsx` consistently uses `existingByPhone` (`Map<string, ExistingMatch[]>`), declared at line 210 and used at lines 708, 741-747, 767-774, 789-800.
- Line 674 in the current file is inside the in-file duplicate-phone `useMemo` and references only `parsedRows` — no old identifier.

So the requested rename cleanup has nothing left to change. The runtime error is almost certainly being thrown by a **stale JavaScript bundle served from the service worker's precache**, not by the current code. This project registers a service worker with precaching, so a browser that cached the pre-rename chunk will keep executing the old code (and its old identifier) until the SW updates.

That diagnosis is consistent but not yet proven — proving it is the first step below, not an assumption.

## Plan

1. **Confirm the current code runs clean.** Load the Import Customers page in a real browser against the running app and capture the console. If it renders with no `ReferenceError`, the source is confirmed good and the production error is a stale-bundle artefact.
2. **If the error does reproduce**, capture the exact failing stack and the served chunk, map it back to source, and fix the real reference before continuing. (No fix is written until this is known.)
3. **Re-run the three verification cases end-to-end** with a small test spreadsheet:
   - **Conflict badges on shared phones** — a row whose phone matches more than one existing customer shows the "Conflict" badge and a blocking error, and is not committed.
   - **Single-match / new-phone regression** — a row matching exactly one existing customer updates it; a row with an unseen phone creates a new customer. Counts in the result summary match.
   - **Forced ambiguous commit** — committing a file that contains an ambiguous row skips only that row, creates/updates the rest, and records `skipped_ambiguous` in the `import_runs` audit row.
4. **Report** the console output, the observed badge/commit behaviour per case, and the resulting `import_runs` row.
5. **Revert all test data** created during verification (test customers deleted, any touched real customer restored to its original values), same as the previous round.

## Stale-bundle follow-up (only if step 1 confirms clean source)

Users still seeing the error need the new bundle. Options, cheapest first — I'll recommend one after step 1 rather than pre-committing:

- Hard reload / SW update on the affected device (no code change).
- Confirm the service worker config uses `skipWaiting` + `clientsClaim` so a new deploy replaces the cached shell on next load instead of on a later visit.

## Technical notes

- No changes to `buildRow`, duplicate detection, header mapping, or the commit loop.
- Verification uses the live app on localhost with the existing signed-in session; test rows are namespaced so cleanup is unambiguous.
