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
   - **Phone**: on blur, run `formatPhoneInternational` and set the formatted value back into state; run `validatePhone` and show error inline.
   - **Eircode**: on blur, run `formatEircode` and set formatted value back; run `validateEircode` and show error inline.
   - **Address**: validate required on blur; show error inline.
4. Duplicate check before proceeding:
   - When the user clicks Continue, if `isNew`, query `customers` for an existing row with the same `phone` (already formatted) and current `organisation_id`.
   - If a match is found, set `duplicate` and block progression (same warning pattern as `AddCustomerSheet`, rendered inline in StepCustomer).
5. Update `canProceed` (line ~149):
   - Require `validatePhone(phone) === null` instead of just `phone.trim()`.
   - Require no active `duplicate`.
6. Update `handleNext`:
   - Re-run all field validations; abort if any fail.
   - Use the formatted phone and trimmed name/eircode in the `onNext` payload so downstream `handleSubmit` stores clean data.
7. Visual feedback:
   - Apply the existing `validationBorderClass` / `ValidationMessage` pattern from `src/components/shared/FormValidation.tsx` for invalid fields, matching the wizard's current validation styling.

Testing
- Add one regression unit test that simulates the quick-add form state:
  - Phone `"0894436301"` is formatted to `"+353894436301"` and passes validation.
  - Name `"Fred  White "` is trimmed to `"Fred White"`.
  - Eircode `"d02h123"` is formatted to `"D02 H123"`.
  - Invalid phone blocks `canProceed`.

Risk level: Low — UI-only change inside a single component, reuses existing validation helpers already proven in `AddCustomerSheet.tsx`.
