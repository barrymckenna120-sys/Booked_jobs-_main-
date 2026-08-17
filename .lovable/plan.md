# BJ-XXXX — Area field: audit findings + standardised picker

## Step 1 audit findings (read-only, completed)

### Where Area is rendered / written

| Place | File | Table.column | Control today |
|---|---|---|---|
| Add Customer sheet | `src/components/customer/AddCustomerSheet.tsx` | writes `customers.area_code` (insert + duplicate-update) | plain text input (`CustomerFormField`, maxLength 10, placeholder "e.g. D14") |
| Customer detail edit | `src/pages/CustomerDetail.tsx` | reads/writes `customers.area_code` | plain text input |
| New Job wizard, Step 1 | `src/components/jobs/NewJobPanel.tsx` (line 535) | writes `service_calls.area_code` **and** back-fills `customers.area_code` | plain text input, placeholder "e.g. Kilmainham, Dublin 8" (encourages free text) |
| Tally intake | `supabase/functions/tally-incoming-job` | `service_calls.area_code` | form field from Tally, uncontrolled text |
| Read-only displays | `JobDetail.tsx`, `Schedule.tsx` + `JobSlotDrawer.tsx`, `IncomingJobs`/`JobReviewPanel`/`IncomingJobCard`, `EngineerJobDetail.tsx`, `engineer/JobDetailSheet.tsx`, `EngineerJobCard.tsx`, `Customers.tsx` table | read only | text |
| Filters / grouping | `Customers.tsx` (area filter chips), `Renewals.tsx` (`normalizeArea`, bulk WhatsApp by area), `send-area-bulk-whatsapp` | read only | derived from stored values |
| Export | `settings/DataTab.tsx` CSV "Area Code" | read only | — |

Validation/normalisation helpers: `src/lib/customerValidation.ts` — `validateAreaCode` (loose regex allowing `0x`, `Dx`, or any word up to 30 chars) and `normalizeAreaCode` ("Dublin 15" → "D15", uppercase). Only the customer forms use them; the New Job wizard does not.

### Constraints
No CHECK constraint and no enum on `customers.area_code` or `service_calls.area_code` — both are plain nullable text.

There **is** a DB trigger: `customers_derive_area_code` → `public.derive_area_code()`. On insert, and on update when `eircode` changes, it overwrites `area_code` with the `D<digits>[W]` prefix of the eircode. So for customers with a Dublin eircode the picker value can be silently replaced by the trigger, and it emits zero-padded forms (`D01`, `D06`) from eircodes like `D01X2Y3`.

### Existing data (all tenants)
Dirty values that would not match the official list:
- Zero-padded: `D01` (4), `D02` (12 jobs), `D04`, `D06` (2), `D08` (3), `D09` — same districts, different spelling.
- Non-existent districts already stored: `D19` (2 jobs), `D21` (2 jobs), `D23` (3 jobs), `D24W` (1 customer).
- Non-Dublin / county values: `Co Dublin` (3), `Meath`, `Kildare`, `Wicklow`, `co galway ` (trailing space), `A84`.
- Free text: `Dublin 2`, `Dublin 8 `, `kilmainham `, `other`.
- Nulls: 18 customers, 281 jobs.

Both tenants (K&N `8c37827f…`, Dublin Gas `f195068…`) hold values; Dublin Gas has `D02`, `D04`, `D08`, `D14` — so it is a usable non-K&N verification tenant.

## Decisions needed from you
1. Zero-padded values (`D01`→`D1`, `D02`→`D2`, `D04`, `D06`, `D08`, `D09`): normalise in a one-off data migration, or leave and map at display time?
2. Ghost districts (`D19`, `D21`, `D23`, `D24W`) and county values (`Meath`, `Kildare`, `Wicklow`, `Co Dublin`, `co galway`, `A84`, `kilmainham`, `Dublin 2/8`): map to `SCD`/`Other`, or leave as-is and let the combobox show them as a legacy value?
3. The `derive_area_code` trigger: keep (eircode wins over the picker), or change it to only fill when `area_code` is null so an explicit pick is never overwritten?

## Implementation once decisions land (single-concern)
1. `src/lib/areaCodes.ts` — official list `D1, D2, D3, D4, D5, D6, D6W, D7, D8, D9, D10, D11, D12, D13, D14, D15, D16, D17, D18, D20, D22, D24` + `SCD` + `Other`, plus `normalizeAreaValue()` folding zero-padding and "Dublin 15" style input. Unit tested.
2. `src/components/shared/AreaCombobox.tsx` — one reusable combobox styled like the Boiler Brand field in `NewJobPanel` (type-to-filter, chevron to open full list, free text kept when `Other`). Accepts a legacy value not in the list and shows it as the current selection rather than blanking it.
3. Swap in the three write surfaces: `AddCustomerSheet`, `CustomerDetail`, `NewJobPanel` Step 1. No changes to read-only displays, filters, exports, or edge functions in this pass — filters keep working off stored values.
4. Data migration only if decisions 1/2 call for it, as a separate step with before/after counts.
5. Verify on Dublin Gas (non-K&N): create/edit a customer, create a job, confirm stored value and that an existing `D02` record still displays and saves without loss.

## Notes
Filters in `Customers.tsx` and `Renewals.tsx` bucket by whatever is stored, so until the data question is settled `D2` and `D02` will appear as two separate chips.
