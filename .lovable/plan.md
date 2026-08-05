# Customer import: header detection + Notes preview

## Prompt 2 findings (investigation only — confirmed)

The blank Notes column is a **key-name mismatch in the preview table**, not a mapping problem.

- `HEADER_TO_FIELD` maps `"notes"`, `"note"`, `"comments"`, `"comment"`, `"engineer notes"` → **`engineer_notes`** (`src/pages/ImportCustomers.tsx` lines 49–57). Only the literal header `"customer notes"` maps to `notes` (line 53).
- `buildRow` writes both fields: `engineer_notes: field("engineer_notes")` (line 421) and `notes: field("notes") || null` (line 425).
- The preview table's Notes column renders `fieldKey="notes"` / `display={r.data.notes}` (line 963).

So a file with a plain `Notes` header fills `engineer_notes`, while the preview reads `notes` → always blank, and editing that cell edits the wrong field. No fix applied yet, per your instruction.

## Prompt 1: hidden-column header detection

Current read path (`readFile`, lines 252–277):
- Picks one sheet only: first name containing "customer", else `SheetNames[0]`.
- `XLSX.utils.sheet_to_json(sheet, { header: 1 })` — no `skipHidden`, so column visibility is already ignored.
- `detectHeaderRow` scans only the first 10 rows, skips rows with `length < 3`, and needs ≥3 hits from `KNOWN_HEADERS`.

I reproduced a workbook with your exact header row plus a hidden column (`!cols[2].hidden = true`) and the current code parses it fine (all 9 headers returned, score 4). So plain column hiding is **not** by itself the trigger — something else in the real file is (extra sheet chosen, header below row 10, or a short/sparse header row). I need the failing `.xlsx` to name the exact cause rather than guess.

## Planned changes (after you attach the file / approve)

`src/pages/ImportCustomers.tsx` only:

1. **Read robustly, ignore visibility explicitly**: pass `{ header: 1, defval: "", blankrows: false, raw: false }` and never pass `skipHidden`, so hidden rows/columns are read identically to visible ones.
2. **Detect across all sheets, not one**: run `detectHeaderRow` on every sheet and use the first sheet where it succeeds; keep the "customer" sheet as the preferred first candidate.
3. **Widen the scan**: scan the first 25 rows, drop the `row.length < 3` skip (count non-empty cells instead), so sparse/offset header rows still qualify.
4. **Better failure message**: when detection fails, show the sheet name and the raw first rows it actually saw, so the next failure is self-diagnosing.
5. **Verify** with a generated fixture workbook containing a hidden column, a hidden row, and leading blank/title rows, plus the real file once attached.

The Notes/`engineer_notes` preview mismatch is left untouched in this pass — say the word and I'll fold it into the same change (preview column reads `engineer_notes`, with a separate Customer Notes column).
