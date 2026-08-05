# Import: flag duplicate rows inside the source file

## What the audit found

- The database has no duplicate Philip Ward. K&N has exactly three Ward customers (Peter, Philip, Ann), each with a distinct phone and eircode, all inserted within ~600ms of one another by a single import run.
- `validateImportPhone` (`src/pages/ImportCustomers.tsx:135-146`) strips **all** whitespace before normalizing, so `'089  111 3333'`, `'089 111 3333'` and `'+353 89 111 3333'` all produce the identical `+353891113333`. There is no double-space gap on the phone path.
- The normalized `+353891113333` matches none of the three stored rows; Philip Ward's stored phone is `+353892109224`.
- The duplicate is in the source spreadsheet, and the importer has **no intra-file duplicate detection** — nothing checks whether two rows in the same upload share a phone.

## The real gap

Because the import loop is sequential and matches on phone per row, two rows in one file that share a phone behave like this: row A inserts, row B finds A and overwrites it. Last row silently wins. The operator sees "2 imported" style counts with no warning that one row consumed another. If the two spreadsheet rows have *different* phones (as here), they legitimately become two customers — but the operator never gets told the file contains a repeated name.

## What to build

Add duplicate awareness to the preview step, before anything is written.

1. **In-file phone duplicates (blocking-level warning).** After parsing, group valid rows by normalized phone. For any phone appearing more than once, mark each affected row with a field warning on the phone cell: "Duplicate phone in this file (rows 4, 9) — only the last will be saved."
2. **In-file name duplicates (informational).** Group by normalized name (reuse the existing lowercase/whitespace-collapsing normalizer at line 20). Where a name repeats but phones differ, add an informational note: "Same name as row 9, different phone — will create separate customers." This is the Philip Ward case: surfaced, not blocked.
3. **Existing-customer matches.** Show, per row, whether it will create a new customer or update an existing one, so the operator can see overwrites before committing rather than reading a count afterwards.
4. **Summary banner above the preview** counting each category: new, updating existing, duplicate-phone collisions in file, repeated names.

## Technical notes

All changes are confined to `src/pages/ImportCustomers.tsx`:

- Duplicate grouping runs in the same pass that builds `parsedRows`, keyed on `validateImportPhone(...).normalized` and the line-20 name normalizer.
- Messages go through the existing `fieldWarnings` channel (non-blocking) rather than `fieldErrors`, so rows still import.
- The existing-customer check for step 3 needs one batched query per upload (`phone in (...)` scoped to `organisation_id`), not a per-row lookup, to keep the preview fast.
- No change to `buildRow`, header aliases, `validateImportPhone`, or the import payload.

## Risk

Low — preview and warning surface only. The commit path is untouched. Manual check: upload a file with the same phone twice, and a file with a repeated name on different phones, and confirm the correct category appears in each case.
