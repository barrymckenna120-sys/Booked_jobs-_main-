# Verify boiler details + customer receipt notes on job completion

## Code audit (already done, read-only)

The two new blocks are present in the completion sheet and correctly wired:

- `CompleteSheet.tsx` renders a "Boiler details" block (Boiler make, Boiler model, Warranty expiry) pre-filled from the customer record, and a "Notes for customer receipt" textarea. All four values are passed out on "Mark as Complete".
- `EngineerJobDetail.tsx` splits the payload: boiler make/model/warranty are written to `customers` (only when changed, cleared values written as null, also queued when offline), and the receipt note is written to `service_calls.customer_facing_notes` for that visit only.
- The UI-only keys (`boilerMake`, `boilerModel`, `warrantyExpiry`, `customerNotes`) are stripped from the job update payload, so they cannot cause an unknown-column failure.
- All four database columns exist: `customers.boiler_brand` (text), `customers.boiler_model` (text), `customers.warranty_expiry_date` (date), `service_calls.customer_facing_notes` (text).

No defect is visible from code alone. Nothing in the audit explains a blank or erroring block, so the live run is needed to see what actually happens on your device.

## What the live check needs (requires approval — it writes data)

The remaining steps you asked for change data, so they sit outside a read-only audit:

1. Create a fresh scratch job on K&N (test customer, no real phone number) so no real customer record is touched.
2. Open it in the engineer app, screenshot the completion sheet to confirm both blocks render, and capture any console errors.
3. Fill Boiler make / model / warranty expiry / customer receipt note, tap Mark as Complete, and record the exact outcome (success, toast, or error).
4. Immediately query that job and its customer to confirm `boiler_brand`, `boiler_model`, `warranty_expiry_date`, and `customer_facing_notes` were written.
5. Report findings with screenshots, and confirm the scratch job is the only row touched.

If the fields turn out not to persist, I will report the cause first rather than fixing it in the same pass.

## Notes

Read-only, no code changes. If you would rather run step 3 yourself on your phone, I can do steps 1, 4 and 5 only and skip the browser session.
