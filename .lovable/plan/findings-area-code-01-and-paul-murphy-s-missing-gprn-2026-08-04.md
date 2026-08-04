# Findings: Area Code "01" and Paul Murphy's missing GPRN

## Part 1 — Area Code "01" is not saved data, it's a placeholder

Verified in the database and the code:

- `customers.area_code` has **no column default** (`column_default = null`, nullable).
- No trigger writes it. No Edge Function writes `'01'`. Import deliberately omits `area_code`.
- Paul Murphy's stored `area_code` is **NULL**.

The "01" you see is the greyed-out placeholder text on the Area Code input:

- `src/components/customer/AddCustomerSheet.tsx:200` — `placeholder="01"`
- `src/pages/CustomerDetail.tsx:395` — `placeholder="01"`

Both flows only write a value when the user types one (`form.area_code.trim() ? normalizeAreaCode(...) : null`). So nothing is hardcoding `01` into the record — the field is genuinely empty and the placeholder just looks like a filled value.

Optional cleanup (not required for correctness): change the placeholder to something clearly non-value-like, e.g. `e.g. D14`, so an empty field never reads as data.

## Part 2 — Paul Murphy's GPRN

### What the data actually shows

| Record | created_at | updated_at | gprn | area_code |
|---|---|---|---|---|
| Paul Murphy (`7530ce82…`) | 2026-08-04 15:37:47 | 15:37:47 | NULL | NULL |
| Shay De Bara (`073e25f8…`) | 2026-08-04 14:45:55 | 2026-08-04 15:37:46 | `1234567` | NULL |

Two things contradict the assumption in the report:

1. **Shay's stored GPRN is `1234567`, not `A96D1R0`.** So GPRN mapping was never demonstrated to work from that spreadsheet — that value is 7 plain digits, consistent with being typed in the app, not read from the `A96D1R0` cell.
2. **Shay was updated at 15:37:46, one second before Paul was inserted at 15:37:47** — i.e. both rows were touched by the *same* import run. Shay matched on phone and took the update branch (`ImportCustomers.tsx:531-537`), Paul was new and took the insert branch (`:541-553`).

### Why that combination points at the mapping, not the row

`cleanData()` (`ImportCustomers.tsx:493-504`) strips any key whose value is `null`/`""` for all non-required fields. Consequences:

- On the **insert** path, an unread GPRN silently becomes NULL → Paul.
- On the **update** path, an unread GPRN is simply omitted → Shay's pre-existing `1234567` survived untouched.

If the GPRN column had been mapped and read in that run, Shay's value would have been **overwritten with `A96D1R0`**. It wasn't. That is strong evidence the GPRN column was **not mapped (or read as empty) for the entire 15:37 run**, not that Paul's individual cell behaved differently.

Also ruled out as causes:

- **Value format** — `B96D1R0` fails `isValidGprnFormat` (7 digits), but that only sets a soft cell *warning* (`:324-327`); the value is still carried into the payload and the row still imports. So a non-numeric GPRN cannot by itself produce NULL.
- **Partial insert failure** — the insert is a single row insert wrapped in try/catch; a failure would have counted the row as skipped and shown it in the failed-rows list, and no customer record would exist. Paul's record exists complete (name, phone, address, eircode, boiler brand, warranty), so the insert succeeded — GPRN was already absent from the payload before the write.

### The remaining unknown

Whether the GPRN column was left unmapped in the mapping UI for that run, or was mapped but read empty (header text mismatch, merged/shifted column, or the value living in a different column than expected in that specific file). The app keeps no import batch log, so this cannot be resolved from the database alone.

## Recommended next step (verification, not a code change)

Re-open the same spreadsheet in the importer and, **without clicking Import**, check:

1. Does the column-mapping panel show GPRN mapped to the "GPRN" header, or is it unmapped?
2. In the preview table, does Paul Murphy's GPRN cell show `B96D1R0` (with an amber warning) or blank?
3. Does Shay De Bara's row show `A96D1R0` in the preview?

- If the preview shows the values correctly, the 15:37 run simply had GPRN unmapped — a one-off operator/mapping issue, and re-running the import will fix Paul (and overwrite Shay's `1234567` with `A96D1R0`, worth confirming is desired).
- If the preview shows GPRN blank or unmapped for that file, the header in that file isn't matching the alias list and we then fix header matching — I'd want the exact header string before touching the alias map.

Either way, Paul's GPRN can be set directly on his customer record in the app in the meantime.

## Technical notes

- Files inspected: `src/pages/ImportCustomers.tsx`, `src/components/customer/AddCustomerSheet.tsx`, `src/pages/CustomerDetail.tsx`, `src/lib/validation/gprn.ts`.
- Database checks run: `information_schema.columns` defaults for `area_code`/`gprn`/`source`, full row read for both customers, trigger and function listing for `customers`.
- `customers.source` defaults to `'manual'`, and the importer never sets `source` — so `source = 'manual'` does **not** mean a record was created by hand. That field cannot be used to distinguish import-created rows.

No code changes made.
