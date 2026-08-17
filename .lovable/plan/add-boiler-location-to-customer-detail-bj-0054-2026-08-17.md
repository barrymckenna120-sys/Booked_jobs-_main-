Add Boiler Location to Customer Detail — BJ-0054

Goal
Add a "Boiler Location" field to the Boiler Information card in `src/pages/CustomerDetail.tsx`, placed after Boiler Model and before Boiler Type, with the same free-text + datalist autocomplete pattern already used in the New Job wizard.

Changes
1. In `src/pages/CustomerDetail.tsx`, inside the Boiler Information card:
   - Import `BOILER_LOCATIONS` from `@/lib/boilerLocations.ts`.
   - Insert a new `<div className="space-y-1.5">` block between the Boiler Model field and the Boiler Type `<Select>`.
   - Use a plain `<Input>` bound to `form.boiler_location` via `handleChange("boiler_location", e.target.value)`.
   - Add `list="customer-detail-boiler-location-suggestions"` to the input.
   - Render a sibling `<datalist id="customer-detail-boiler-location-suggestions">` with `<option>` entries from `BOILER_LOCATIONS`.
   - Remove the existing TODO comment that references this work.

2. No database migration, no Settings change, no validation function — `customers.boiler_location` already exists and is already fetched into `form` state.

Verification
- Field appears on the Boiler Information card in the expected position.
- Focusing/typing in the field shows autocomplete suggestions from `BOILER_LOCATIONS`.
- Typing a value not in the list still saves to `customers.boiler_location`.
- Run typecheck to confirm no compile errors.
