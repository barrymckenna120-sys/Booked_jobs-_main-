Landline field on CustomerDetail Contact Information card

Current state (verified by reading src/pages/CustomerDetail.tsx):
- The Contact Information card already renders a Landline field at line 413:
  `<CustomerFormField label="Landline (optional)" id="landline_phone" ... />`
- It sits directly below Mobile Number in the same two-column grid.
- Blur validation uses `validateLandline` (7–15 digit sanity, no format enforcement) at line 201.
- `validateAll()` at line 215 includes the same landline validation.
- Save path is generic: `handleChange` updates `form.landline_phone`, and `buildCustomerUpdatePayload(form, originalForm)` will include it if changed. No special handling is required.

Plan
1. Verify the field is visible and editable in the live preview on an existing customer record.
2. Confirm that changing the Landline value and pressing Save persists to `customers.landline_phone`.
3. If the field is missing in the live preview despite being in source, investigate build/deploy or PWA cache gap; otherwise, no further code changes are needed.
4. (Optional) Confirm the row-level layout matches the user's preference for "next to or below Mobile Number".
