# Customer Import: GPRN & Notes mapping, Area Code exclusion

Scope: `src/pages/ImportCustomers.tsx` only. No UI restructure, no other files.

## What changes

1. **GPRN aliases** — already present (`gprn`, `gprn no`, `gprn number`, `gas point reference number`). No change needed; verified in the header alias map.

2. **Notes → Engineer Notes** — currently `notes`, `note`, `comments`, `comment` all map to the **Customer Notes** DB column (`customers.notes`). Repoint `notes` / `comments` (and their singular variants) to the `engineer_notes` field. `customer notes` keeps mapping to Customer Notes for files that explicitly say so. Access Notes stays mapped only from an explicit "Access Notes" header, so nothing auto-populates it.

3. **Whitespace trimming** — header matching already lower-cases and trims (`String(c).trim().toLowerCase()`), so `"GPRN "` matches today. Verified, no change.

4. **Area Code exclusion** — remove `"area code"` / `"area"` from the auto-mapping map so an incoming Area Code column is never auto-mapped, and drop `area_code` from the insert payload so raw source text is never written. The field stays out of the mapping UI's available list.

## Verification

- Real-file check with the sample spreadsheet: headers detected are `Customer Name, Address, Eircode, Area Code, Mobile Number, Last Service Date, Next Service Date, Boiler Model`. Expected after the change: Area Code column left unmapped, everything else unchanged.
- The named file `customer_list__kn_gas_04_08_2026.xlsx` is not in uploads — only `karls_gas_customer_2.xlsx` is available. Upload the exact file if you want verification run against it specifically.
- Trailing-space check: parse a copy with header `"GPRN "` and confirm it still maps.

## Note on the Area Code decision

There is currently **no `derive_area_code()` trigger** on `public.customers` (only the `updated_at` trigger). So after this change imported customers will have `area_code` empty until that trigger/derivation exists. Area-code filters in the UI would show these customers as blank. Flagging it so the gap is intentional, not a surprise.

## Risk

Low. Import-only presentation/mapping logic; no bookings, payments, RLS or auth touched. One behaviour change to call out: files with a plain "Notes" column now land in Engineer Notes rather than Customer Notes.
