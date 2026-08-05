# Row-level selection in the Customer Import preview

Operator picks which ready rows go in this commit. Blocked rows stay blocked. Everything upstream (header mapping, duplicate detection, conflict blocking, `buildRow`) is untouched.

## Behaviour

- New leftmost checkbox column in the preview table, with a header checkbox that selects/clears all currently-ready rows on the visible page.
- A row that is ready (`isValid: true`) defaults to checked.
- A blocked row — validation error or ambiguous-phone conflict — renders its checkbox disabled and unchecked, with a tooltip explaining it can't be included. No force-include.
- Unchecking a ready row removes it from this commit: not written, not counted, not logged. It stays visible in the preview and can be re-checked before committing.
- Footer shows `Selected: N of M ready`, and when the file still contains blocked rows a second badge reads `N blocked — still needs fixing`, so the operator knows the file isn't fully done. The button reads `Import N customers` from the selected count and disables only when the selection is empty.
- Selection resets whenever a new file is parsed or the column mapping changes (rows are re-validated, so stale selections would be wrong). Rows that become blocked after a mapping change drop out of the selection automatically.

## Audit log decision (flagging, as asked)

Unchecked rows are **excluded entirely** from `import_runs` — no `row_details` entry, and not counted in `total_rows`. Rationale: they were never submitted, so recording them would misrepresent the run and inflate the totals the error-alert email keys off. `total_rows` becomes `selected ready rows + ambiguous rows in this run`. The alternative (a `skipped_deselected` outcome) was rejected: it adds an enum value and UI label for rows where nothing happened.

## Blocked rows no longer gate the file

Today the footer button is disabled whenever `errorCount > 0` (line 1004), so one bad row blocks the whole file. That condition becomes `selectedCount === 0`. A file mixing ready and blocked rows now commits the selected ready rows; blocked rows stay in the preview with their red state and error badges, are never written, and are still visible to the operator. Ambiguous-phone rows keep their existing `skipped_ambiguous` audit entry and still count toward `error_count`, so the import-error email still fires for them.


## Technical notes

All changes in `src/pages/ImportCustomers.tsx`:

| Location | Change |
| --- | --- |
| state | new `selectedRowNums: Set<number>` plus a `dirty` flag so the default-checked rule applies until the operator touches it |
| after `decoratedRows` (line 833) | derive the effective selection: intersect with `isValid` rows; when untouched, all ready rows |
| line 837 | add `selectedCount`; keep `validCount` / `errorCount` for the banners |
| lines 998-1004 | label uses `selectedCount`; `importDisabled` becomes `importBlocked \|\| selectedCount === 0` — the `errorCount > 0` term and the "Fix N rows to continue" label are removed |
| preview header/body (lines ~1195-1240) | new checkbox column using the existing shadcn `Checkbox` |
| `handleImport` (line 526) | `validRows` filtered to the selection; `total_rows` = selected + ambiguous. Commit loop, per-row logic, and the ambiguous pre-log stay as they are |
| footer (lines 1333-1340) | `Selected: N of M ready` badge plus a conditional `N blocked — still needs fixing` badge |

## Verification (real output, before reporting done)

1. Upload a 3-ready-row file into K&N Gas Services, uncheck the middle row, confirm the button reads `Import 2 customers`.
2. Commit. Query the database: exactly 2 customers created/updated, and the unchecked row's phone has no matching customer row.
3. Query the resulting `import_runs` row: `total_rows: 2`, `created_count` matching, and `row_details` containing exactly 2 entries — none for the unchecked row.
4. Re-check the unchecked row and confirm the count and label update live.
5. Upload a file with 2 ready rows and 1 ambiguous-phone row. Confirm the button is enabled and labelled `Import 2 customers` with the blocked badge showing. Commit, then query: exactly 2 customers created/updated, no new or modified customer on the ambiguous phone, and the `import_runs` row showing `total_rows: 3` with the ambiguous row logged as `skipped_ambiguous`.
6. Delete every test customer and every test `import_runs` row, then re-query both to confirm nothing is left behind.

### Extra case: `buildRow` validation failure (not an ambiguous phone)

Separately test a file with 2 ready rows plus 1 row that fails `buildRow` validation (e.g. missing required name/address/eircode). Confirm all four properties:

- its checkbox renders disabled and unchecked,
- it is excluded from the commit (no customer row created for it),
- it produces no `row_details` entry and is not counted in `total_rows`,
- the 2 ready rows still commit successfully — the validation failure does not gate the file.

Report which of the two blocked types (validation vs ambiguous) each observation came from, so the two paths are not conflated.


