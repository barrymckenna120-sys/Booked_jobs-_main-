# Customer Import: GPRN & Notes mapping, Area Code exclusion

Scope: `src/pages/ImportCustomers.tsx` only. No UI restructure, no other files.

## What changes

1. **GPRN aliases** — already present (`gprn`, `gprn no`, `gprn number`, `gas point reference number`). Verified: `'GPRN '` → `gprn`. No change needed.

2. **Notes → Engineer Notes** — currently `notes`, `note`, `comments`, `comment` all map to the **Customer Notes** column (`customers.notes`); verified `'notes '` → `notes` today. Repoint `notes` / `note` / `comments` / `comment` to `engineer_notes`. `customer notes` keeps mapping to Customer Notes. Access Notes stays mapped only from an explicit "Access Notes" header.

3. **Whitespace normalization** — source uses `.trim().toLowerCase()` only, with **no internal-whitespace collapsing**. Leading/trailing works (`' Boiler Make '` → `boiler_brand`). Add a single `normalizeHeader()` that also collapses runs of internal whitespace to one space, applied everywhere headers are compared, so real-world headers like `'Area  Code '` (double space) normalize predictably instead of silently missing every alias.

4. **Area Code exclusion** — remove both `"area code"` **and** `"area"` from the auto-mapping map (verified `'Area '` currently maps to `area_code`), and drop `area_code` from the insert payload so raw source text is never written. With internal-space collapsing in place, `'Area  Code '` normalizes to `area code` and is excluded deliberately rather than by accident.

5. **Header-row detection blocker** — `detectHeaderRow` requires ≥3 hits from `KNOWN_HEADERS` (`customer name, mobile number, phone number, address, eircode`). The real file's headers (`Name , Address , Area , Eircode , Phone , Boiler Make , GPRN , notes , Area  Code `) score only **2** (`address`, `eircode`), so the file fails detection before any mapping runs. Add `"name"` and `"phone"` as recognised headers (`name` → `name`, `phone` already aliased) and include them in `KNOWN_HEADERS`.

## Verification

Verified against the stated header row using the map extracted from the source:

```
'Name '         -> 'name'        -> None            (blocker, item 5)
'Address '      -> 'address'     -> address
'Area '         -> 'area'        -> area_code       (must be excluded)
'Eircode '      -> 'eircode'     -> eircode
'Phone '        -> 'phone'       -> phone
' Boiler Make ' -> 'boiler make' -> boiler_brand    OK
'GPRN '         -> 'gprn'        -> gprn            OK
'notes '        -> 'notes'       -> notes           (must become engineer_notes)
'Area  Code '   -> 'area  code'  -> None            (unmapped only by accident)
KNOWN_HEADERS matched: 2 of required 3
```

After implementation, the same script re-runs and must show: `name` → name, `notes` → engineer_notes, `area`/`area code` → unmapped, `gprn` → gprn, `boiler make` → boiler_brand, detection count ≥3.

Note: `customer_list__kn_gas_04_08_2026.xlsx` is not present in uploads (only `karls_gas_customer_2.xlsx`). Upload it to re-verify end-to-end through the actual file parse rather than the header row alone.

## Note on the Area Code decision

There is currently **no `derive_area_code()` trigger** on `public.customers` (only the `updated_at` trigger). Imported customers will therefore have `area_code` empty until that derivation exists, and area-code filters will show them as blank. Flagging so the gap is intentional.

## Risk

Low. Import-only mapping/normalization logic; no bookings, payments, RLS or auth touched. Behaviour changes to call out: a plain "Notes" column now lands in Engineer Notes, and Area/Area Code columns are no longer imported.

