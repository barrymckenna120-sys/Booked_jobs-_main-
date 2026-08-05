# Row-level selection in the Customer Import preview

Operator picks which ready rows go in this commit. Blocked rows stay blocked. Everything upstream (header mapping, duplicate detection, conflict blocking, `buildRow`) is untouched.

## Behaviour

- New leftmost checkbox column in the preview table, with a header checkbox that selects/clears all currently-ready rows on the visible page.
- A row that is ready (`isValid: true`) defaults to checked.
- A blocked row — validation error or ambiguous-phone conflict — renders its checkbox disabled and unchecked, with a tooltip explaining it can't be included. No force-include.
- Unchecking a ready row removes it from this commit: not written, not counted, not logged. It stays visible in the preview and can be re-checked before committing.
- Footer badge becomes `Selected: N of M ready`, and the button reads `Import N customers` using the selected count. Button disables when the selection is empty.
- Selection resets whenever a new file is parsed or the column mapping changes (rows are re-validated, so stale selections would be wrong). Rows that become blocked after a mapping change drop out of the selection automatically.

## Audit log decision (flagging, as asked)

Unchecked rows are **excluded entirely** from `import_runs` — no `row_details` entry, and not counted in `total_rows`. Rationale: they were never submitted, so recording them would misrepresent the run and inflate the totals the error-alert email keys off. `total_rows` becomes `selected ready rows + ambiguous rows that were part of the attempt`. The alternative (a `skipped_deselected` outcome) was rejected: it adds a schema-adjacent enum value and UI label for rows where nothing happened.

## Existing behaviour worth naming

The footer button is currently disabled whenever `errorCount > 0` (line 1004), so today an ambiguous or invalid row blocks the whole file, not just itself. This change keeps that rule as-is — selection gates which ready rows commit, it does not unblock a file that has blocked rows. Say the word if you also want blocked rows to be skippable so the rest of the file can proceed; that's a separate decision.

## Technical notes

All changes in `src/pages/ImportCustomers.tsx`:

| Location | Change |
| --- | --- |
| state | new `selectedRowNums: Set<number>` plus a `dirty` flag so the default-checked rule applies until the operator touches it |
| after `decoratedRows` (line 833) | derive the effective selection: intersect with `isValid` rows; when untouched, all ready rows |
| line 837 | add `selectedCount`; keep `validCount` / `errorCount` for the banners |
| line 1002-1004 | label uses `selectedCount`; disabled when `selectedCount === 0` |
| preview header/body (lines ~1195-1240) | new checkbox column using the existing shadcn `Checkbox` |
| `handleImport` (line 526) | `validRows` filtered to the selection; `total_rows` = selected + ambiguous. Commit loop, per-row logic, and the ambiguous pre-log stay as they are |
| footer (line 1335) | `Selected: N of M ready` badge |

## Verification (real output, before reporting done)

1. Upload a 3-ready-row file into K&N Gas Services, uncheck the middle row, confirm the button reads `Import 2 customers`.
2. Commit. Query the database: exactly 2 customers created/updated, and the unchecked row's phone has no matching customer row.
3. Query the resulting `import_runs` row: `total_rows: 2`, `created_count` matching, and `row_details` containing exactly 2 entries — none for the unchecked row.
4. Re-check the unchecked row and confirm the count and label update live.
5. Delete every test customer and every test `import_runs` row, then re-query both to confirm nothing is left behind.
