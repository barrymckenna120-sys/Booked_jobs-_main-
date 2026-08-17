Landline field on CustomerDetail.tsx Contact Information card

Current state (verified by reading src/pages/CustomerDetail.tsx and src/lib/customerValidation.ts):
- The Contact Information card already renders a Landline field at line 413:
  `<CustomerFormField label="Landline (optional)" id="landline_phone" ... />`
- It sits directly below Mobile Number in the same two-column grid, alongside Email/Address/Eircode/Area Code/GPRN.
- Blur validation uses `validateLandline` (line 201) which enforces 7–15 digits, no format enforcement (src/lib/customerValidation.ts:42-47).
- `validateAll()` at line 215 includes the same landline validation.
- Save path is generic: `handleChange` mutates `form.landline_phone`, and `handleSave` builds the update payload via `buildCustomerUpdatePayload(form, originalForm)`. No special handling is required.

Plan
1. Verify the field is visible and editable in the live preview on an existing customer record.
2. Confirm that changing the Landline value and pressing Save persists to `customers.landline_phone`.
3. No code changes are needed unless the live preview reveals the field is missing or the layout needs adjustment.
