# Receipt: Boiler Details + Notes footer (screen + PDF)

Add a two-column section to the payment receipt — "Boiler Details" (left, plain text) and "Notes" (right, boxed callout) — placed below the payment/amount block and above the existing thank-you / RGI footer. Applied identically on screen and in the PDF.

## Confirmed before building

- `customers.boiler_brand` (52/91 populated) and `customers.boiler_model` (36/91) are the populated make/model pair — no `boiler_make` column exists. `customers.gprn` (11/91) and `customers.next_service_due` (83/91) exist.
- `customers.warranty_expiry_date` does **not** exist yet, and neither does `service_calls.customer_facing_notes`. The earlier migration adding them was never applied, so this build must add them first.
- The public receipt screen reads a single JSON blob from the `get_receipt_public` database function, which currently returns none of these fields — that function must be extended or the new fields will be blank on screen.

## Step 1 — Database

One migration:
- Add nullable `customers.warranty_expiry_date date`.
- Add nullable `service_calls.customer_facing_notes text`.
- Replace `get_receipt_public` to also return: boiler brand, boiler model, warranty expiry date, next service due, GPRN, and the job's customer-facing notes. No other returned field changes; existing behaviour and access rules stay the same.

`customers.engineer_notes` is never exposed by this function.

## Step 2 — On-screen receipt (`src/pages/PublicReceipt.tsx`)

New section inserted after the "Amount Paid" block, before the Download button / footer:

- Left column heading "Boiler Details" in the existing small uppercase grey label style; rows:
  - Make & Model — brand + model joined, shown if either is present
  - Warranty — future date: `Under Warranty (until 12 Mar 2027)`; past date: `Warranty Expired`; null: row hidden
  - Next Service Due — existing `formatDate` helper
  - GPRN
- Right column heading "Notes" as a boxed callout (light grey background, thin border, rounded corners, matching the existing card/box treatment on the page), content from the job's customer-facing notes only.
- Empty-state rules: individual empty rows are omitted; a column with nothing to show is hidden and the remaining column spans full width; if both are empty the whole section (and its divider) is not rendered.
- Remove the hardcoded "Next annual boiler service due" footer line — Next Service Due now appears in the new section, so the old line is a duplicate with a possibly conflicting date.

Typography and spacing reuse the classes already on the page — no new tokens, no changes to the payment block or the thank-you/RGI footer.

## Step 3 — PDF (`supabase/functions/generate-receipt-pdf/index.ts`)

- Extend the customer query with brand, model, warranty expiry, next service due and GPRN, and the job query with customer-facing notes.
- After the Total Paid box, before the closing divider and footer text, draw the same two columns using the existing `addText`/`drawLine`/`roundedRect` helpers: left column as label/value lines at the current 8pt grey label + 9pt value sizing; right column as a rounded light-grey filled box with a thin border and wrapped note text (via jsPDF `splitTextToSize`).
- Same hide rules as the screen; vertical cursor `y` advances by the taller of the two columns so the existing footer keeps its spacing.
- Remove the same hardcoded "Next annual boiler service due" line from the PDF footer (thank-you line and RGI line stay).

## Notes

- The PDF short-circuits when `receipt_pdf_url` is already set, so existing receipts keep their current PDF; only new receipts get the new section. No back-fill or regeneration is included.
- Nothing else on the screen or PDF layout changes.
