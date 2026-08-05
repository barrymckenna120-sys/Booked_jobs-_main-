# Import preview: in-file duplicate phones + new/update indicator

Scoped to items 1 and 3 of the earlier plan. Items 2 (name-duplicate notes) and 4 (summary banner counts) are deliberately out of scope for this pass.

## 1. In-file phone duplicate detection

Group parsed rows by the already-normalized phone held in `row.data.phone`, so formatting differences in the source file cannot hide a collision. For any phone appearing on more than one row, every row in that group gets a warning naming the other row number(s):

> Duplicate phone in this file (rows 4, 9) — only the last will be saved.

Non-blocking: delivered through `fieldWarnings.phone`, never `fieldErrors`, so affected rows still import and still count as valid.

## 2. Per-row new-vs-updating-existing indicator

One batched lookup per file, not per row: collect the unique normalized phones across all parsed rows, then query `customers` for `phone in (...)` scoped to the current `organisation_id`, chunked at 200 phones per request for large files. The result is a set of phones that already exist for this organisation.

The preview's Status column then shows, per row, whether the commit will create a new customer or update an existing one, alongside the existing Ready/Error badge. While the lookup is in flight, or if it fails, the row shows no claim rather than a wrong one.

## Technical notes

All changes confined to `src/pages/ImportCustomers.tsx`:

- Duplicate grouping is a `useMemo` over `parsedRows` producing a `rowNum → message` map. Rows are decorated with that message in a second `useMemo` that spreads `fieldWarnings`, so `buildRow` itself is untouched and re-running validation cannot clobber the note.
- The preview table renders from the decorated rows; the import loop keeps reading the undecorated `parsedRows`, so the payload is unchanged.
- The existing-customer lookup runs in a `useEffect` keyed on `organisation_id` plus a stable joined signature of the sorted phone list, so it fires once per file and re-fires only when the mapping or an edit actually changes the phone set. A cancellation flag prevents a stale response from overwriting a newer one.
- No change to `buildRow`, header aliases, `validateImportPhone`, or the import payload.

## Verification

- Upload a file with the same phone on two rows; confirm both rows are flagged and each names the other's row number, and that both still show as importable.
- Upload a file mixing phones that already exist in the organisation with new ones; confirm the new/update indicator is correct on every row, checked against the database.

## Risk

Low — preview-only. The commit path is untouched, and the new query is read-only and organisation-scoped.
