# Import preview: Notes column fix + data check

## The bug

`buildRow` maps a plain `Notes` header to **`engineer_notes`** (`src/pages/ImportCustomers.tsx` lines 54–57, 421), but the preview table's single "Notes" column reads and edits **`notes`** (line 963). Result: the column is always blank for those files, and any inline edit writes to the wrong field.

## Fix (frontend only, `src/pages/ImportCustomers.tsx`)

1. Change the existing preview column to `fieldKey="engineer_notes"` with header **Engineer Notes**, displaying `r.data.engineer_notes`.
2. Add a second column **Customer Notes** with `fieldKey="notes"`, displaying `r.data.notes` (populated only by a `Customer Notes` header).
3. Keep both on the `hidden lg:table-cell` breakpoint so mobile density is unchanged; widths `min-w-[180px]`.
4. Confirm the manual column-mapper already exposes both fields (`FIELD_LABELS` has `engineer_notes: "Engineer Notes"` and `notes: "Customer Notes"`) so remapping stays possible either way.

No changes to `buildRow`, the header aliases, or the import payload — those are already correct.

## Data check (done, read-only — no migration proposed)

Counted customers with content in each field:

| Org | notes filled | engineer_notes filled | notes only |
|---|---|---|---|
| Dublin Gas | 0 | 2 | 0 |
| K&N Gas Services | 7 | 20 | 4 |

The 4 K&N "notes only" rows (all created 2026-02-25):

- barry test 11 — auto-generated service-log text ("03/04/2026 - Barry McKenna: Boiler serviced…")
- Alan Byrne — same auto-generated service-log text
- Brian Duffy — "Early morning preferred"
- Emma Kavanagh — "Hard of hearing"

None of these look like misfiled engineer notes: two are system-written service-history entries and two are genuine customer preferences. Imports since the bug landed data in `engineer_notes` correctly (the bug was display-only), so **no migration is warranted**. The only corruption path was an operator typing into the blank preview cell, and no rows show that pattern.

## Risk

Low — presentation-layer change to one table plus one added column. Manual check: import a file with a `Notes` column and confirm values appear under Engineer Notes and save through correctly.
