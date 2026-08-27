# Import Customers: `existingPhones is not defined` + import-log verification

## Finding 1 — there is no leftover `existingPhones` reference

I searched `src/pages/ImportCustomers.tsx`, all of `src/`, `supabase/`, and the whole tree excluding `node_modules`/`dist` for `existingPhones`:

**Zero matches.** The file consistently uses `existingByPhone` (`Map<string, ExistingMatch[]>`), declared at line 210 and read at lines 708, 741-747, 767-774, 789-800. Line 674 — the line named in the production stack — is inside the in-file duplicate-phone `useMemo` and touches only `parsedRows`.

So there is nothing to rename. The production `ReferenceError` is almost certainly a **stale JavaScript bundle served from the service worker precache** — a browser holding the pre-rename chunk keeps running the old identifier. That is the leading explanation, not a proven one; proving it is step 1 below, and no fix gets written until it's known.

## Finding 2 — "who ran it" when the user is deactivated or deleted (confirmed, no change needed)

Already handled, in both views, by the profile join rather than the FK:

- `ImportRunHistory.tsx` lines 44-52 and `ImportRunsOverview.tsx` lines 42-59 collect the distinct `imported_by` ids, fetch `profiles.user_id, display_name`, and build a lookup map.
- Render sites — `ImportRunHistory.tsx:117` and `ImportRunsOverview.tsx:149` — use `names[run.imported_by] || "—"`.

Consequences:

- **Deactivated user** (`profiles.is_active = false`): the profile row still exists, so the real display name still renders. No blank, no break.
- **Missing/deleted profile**: the map has no entry, so the cell falls back to the em dash `—`. No crash, no blank cell.
- `import_runs.imported_by` is `NOT NULL REFERENCES auth.users(id)` with no `ON DELETE` action, so deleting the auth user is blocked while runs reference it — the id in a run row can never dangle.

The only judgement call is cosmetic: `—` is less informative than a label like "Deleted user". I'll leave it as `—` unless you'd prefer the explicit label.

## Finding 3 — one honest gap in the audit log to flag

`handleImport` filters `decoratedRows.filter(r => r.isValid)` before the loop, and ambiguous rows are already marked invalid. So:

- Ambiguous rows never reach the loop, meaning the `matchCount > 1` branch that writes `outcome: "skipped_ambiguous"` is a **defensive second gate** that the UI cannot normally reach.
- `total_rows` is `validRows.length`, so **ambiguous rows appear in no `import_runs` row at all** — not in `total_rows`, not in `row_details`.

That is safe (nothing is wrongly created) but means the log under-reports what the operator saw. I'll report the observed behaviour and, if you want it changed, that's a follow-up — not part of this fix.

## Verification plan

1. **Confirm the current code runs clean.** Open `/settings/import` in a real browser against the running app with the signed-in session, capture the console, and screenshot the page. If it renders with no `ReferenceError`, the source is confirmed good and production is a stale-bundle problem.
2. **If the error does reproduce**, capture the failing stack and served chunk, map it back to source, and fix the real reference before continuing.
3. **Run the three cases** with a single-sheet `.xlsx` (the input only accepts `.xlsx`) containing three rows against K&N Gas Services:
   - **Conflict / shared phone** — `0892109224`, which normalises to `+353892109224` and matches **14** existing K&N customers. Expect the Conflict badge, a blocking error, and no write.
   - **Single match** — a temporary test customer on `+353800000111`. Expect exactly one update.
   - **New phone** — `+353800000222`, unseen. Expect exactly one create.
4. **Report real output**: console log, screenshots of badges and the result summary, and the actual `import_runs` row (`total_rows`, `created_count`, `updated_count`, `error_count`, `row_details`) plus the affected `customers` rows, as query output rather than a description.
5. **Clean up**: delete the created customer, delete the temporary test customer, and delete the `import_runs` row written by the test. No real K&N customer is targeted by any test row, so no live record gets modified.

## Stale-bundle follow-up (only if step 1 confirms clean source)

Cheapest first — I'll recommend after step 1 rather than pre-committing:

- Hard reload / service-worker update on the affected device (no code change).
- Confirm the service worker uses `skipWaiting` + `clientsClaim` so a deploy replaces the cached shell on the next load instead of a later visit.

## Database writes this needs (build mode required)

- Insert one temporary customer `ZZ Verify Single` (`+353800000111`) in K&N.
- Delete, after verification: that test customer, the customer created by case 3, and the test `import_runs` row.

No schema migration. No change to `buildRow`, duplicate detection, header mapping, or the commit loop.
