# Generate and inspect the KN-485 receipt PDF

Verification only — no code or schema changes, and no writes to any job other than the scratch job KN-485.

## Why this is safe

- KN-485 (`receipt_number` KN-2026-7812) is the scratch job created for this audit; its `receipt_pdf_url` is NULL and no file exists in the `certificates` bucket for it, so nothing existing is overwritten.
- Its `customer_facing_notes` is populated ("Boiler serviced and left in good working order.") and the customer record has boiler brand, model and warranty expiry, so both columns of the footer section have data.
- `settings.receipt_show_boiler_details` is `true` for K&N, so the section is enabled.

## Steps

1. Invoke `generate-receipt-pdf` with `{ "job_id": "11111111-2222-3333-4444-555555550002" }` and capture the raw HTTP response.
2. Read the function logs immediately after and report any error or warning.
3. Confirm `service_calls.receipt_pdf_url` for KN-485 is now set and the object exists in the `certificates` bucket with a non-zero size.
4. Download the PDF, render its pages to images, and visually inspect that the Boiler Details block (Make & Model, Warranty, Next Service Due, GPRN) and the Notes box render side by side without overlap or clipping.
5. Report the outcome with the rendered page image, plus the exact drawn values.

## Notes

If generation fails, the report will name the cause only — no fix applied in this pass.
