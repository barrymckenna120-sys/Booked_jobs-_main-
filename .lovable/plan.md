# Fix Philip Ward's boiler record + add placeholder guidance

## Current state (verified)

Philip Ward (job KN-437, status Completed):
- `boiler_brand` = `"ideal combi  in  in ultiiy room"` (free text, everything crammed into one field)
- `boiler_model` = empty
- `boiler_location` = empty (the column exists on the customer record)
- Receipt `KN-2026-5653` already has a stored PDF file

## 1. Clean the customer record

Update Philip Ward's customer record only:
- Boiler make → `Ideal`
- Boiler model → `Combi`
- Boiler location → `Utility room`

Nothing else on the customer or the job changes.

## 2. Regenerate the receipt PDF (confirmed)

Clear the cached PDF link for receipt `KN-2026-5653`, then regenerate it so the stored file shows the corrected boiler details. The receipt link stays the same; nothing is re-sent to the customer.

## 3. Placeholder guidance in the engineer completion sheet

In the engineer Complete Job sheet's Boiler details block, change the placeholders only:
- Boiler make: `e.g. Ideal, Worcester Bosch, Vaillant`
- Boiler model: `e.g. Logic Max Combi2 C30`

No validation, no character limits, no layout change.

## 4. Office-side completion — checked, nothing to mirror

Office completion (Nicole) runs through the office Job Detail page, not the engineer completion sheet. That page's "mark complete" flow only sets status, completion time and an internal note — it has no boiler make/model or customer-receipt-note fields at all, so there is no placeholder to mirror there.

The one office screen where boiler make/model *are* edited is the Customer detail page, and it already carries the same style of guidance ("e.g. Ideal, Worcester, Vaillant") plus brand/model pickers. Optional tidy-up if you want exact parity: align its make placeholder wording to "Worcester Bosch" and add a model example. Say if you'd like that included.

## Technical notes

- Data fix: scoped UPDATE on `customers` id `7607dce9-…4d537` setting `boiler_brand`, `boiler_model`, `boiler_location`.
- PDF: null out `service_calls.receipt_pdf_url` for KN-437, then invoke `generate-receipt-pdf` so it re-renders instead of short-circuiting; verify the new file and inspect the rendered footer.
- UI: `src/components/engineer/CompleteSheet.tsx`, `placeholder` props on `cs-boiler-make` and `cs-boiler-model`.
- Office completion path confirmed at `src/pages/JobDetail.tsx` (status/completed_at/notes only).
