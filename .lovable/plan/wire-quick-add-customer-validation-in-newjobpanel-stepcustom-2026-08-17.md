Wire quick-add customer validation in NewJobPanel StepCustomer

Scope
- Modify only `src/components/jobs/NewJobPanel.tsx` inside the `StepCustomer` quick-add form (lines ~122–310).
- Do not change `AddCustomerSheet.tsx`, Step 2 (GPRN), or any other part of the wizard.

Changes
1. Import validation helpers from `src/lib/customerValidation.ts`:
   - `validatePhone`, `validateEircode`, `validateRequired`, `formatEircode`, `formatPhoneInternational`, `CustomerFieldErrors`.
2. Add local state in `StepCustomer`:
   - `errors: CustomerFieldErrors` for inline field errors.
   - `duplicate: { id: string; name: string } | null` for the normalised-phone duplicate warning.
3. Wire each quick-add field to validation:
   - **Name**: trim value on blur; store trimmed value; validate required on blur; show error inline.
   - **Phone**: on blur, run `validatePhone` on the raw value first (it must pass before formatting); if valid, run `formatPhoneInternational` and set the formatted value back into state. Show error inline otherwise.
   - **Eircode**: on blur, run `formatEircode` and set formatted value back; run `validateEircode` and show error inline.
   - **Address**: validate required on blur; show error inline.
4. Duplicate check before proceeding (fail safe):
   - When the user clicks Continue, if `isNew`, query `customers` for an existing row with the same normalised `phone` and current `organisation_id`.
   - Show a loading state on the Continue button while the check runs (button disabled + "Checking…").
   - If a match is found, set `duplicate` and block progression (same warning pattern as `AddCustomerSheet`, rendered inline in StepCustomer).
   - If the query returns an error, block progression and show a visible inline error: "Couldn't check for duplicates — try again". Never allow progression on an inconclusive check.
5. Update `canProceed` (line ~149):
   - Only tighten the `isNew` branch: require `validatePhone(phone) === null` instead of just `phone.trim()`.
   - The `selected` (existing customer) branch stays exactly as-is — existing records may predate this validation and must not be gated.
   - Require no active `duplicate` and no in-flight duplicate check.
6. Update `handleNext`:
   - Re-run all field validations; abort if any fail.
   - Use the formatted phone and trimmed name/eircode in the `onNext` payload so downstream `handleSubmit` stores clean data.
7. Visual feedback:
   - Apply the existing `validationBorderClass` / `ValidationMessage` pattern from `src/components/shared/FormValidation.tsx` for invalid fields, matching the wizard's current validation styling.

Confirmed behaviour of `formatPhoneInternational` (verified in `src/lib/customerValidation.ts`)
- It never throws and never returns null. It strips whitespace, removes a leading `+`, a leading `353`, and a leading `0`, then unconditionally prepends `+353`. On garbage input it passes the garbage through with a `+353` prefix (e.g. `"abc"` → `"+353abc"`).
- Therefore it must never be used as a validity check. `validatePhone` is the gate: its regex `^(\+?353|0)\d{7,10}$` rejects non-numeric and wrong-length input. The plan runs `validatePhone` on the raw value **before** formatting, so malformed input is caught and never reaches the formatter or the database.


Testing
- Add one regression unit test that simulates the quick-add form state:
  - Phone `"0894436301"` is formatted to `"+353894436301"` and passes validation.
  - Name `"Fred  White "` is trimmed to `"Fred White"`.
  - Eircode `"d02h123"` is formatted to `"D02 H123"`.
  - Invalid phone blocks `canProceed`.

Risk level: Low — UI-only change inside a single component, reuses existing validation helpers already proven in `AddCustomerSheet.tsx`.
