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

## 2. Receipt / PDF impact

The receipt page reads live customer data, so the on-screen receipt shows the corrected values immediately. The PDF is a stored file and is served from cache once generated, so the already-issued PDF keeps the old text until it is regenerated.

Plan: after the data fix, regenerate the KN-485-style PDF for receipt `KN-2026-5653` so the stored file matches the corrected record. The link stays the same — no need to re-send anything to the customer unless you want to. Say the word if you would rather leave the historic PDF untouched.

## 3. Placeholder guidance in the completion sheet

In the engineer Complete Job sheet's Boiler details block, change the placeholders only:
- Boiler make: `e.g. Ideal, Worcester Bosch, Vaillant`
- Boiler model: `e.g. Logic Max Combi2 C30`

No validation, no character limits, no layout change.

## Technical notes

- Data fix: single scoped UPDATE on `customers` for id `7607dce9-…4d537` setting `boiler_brand`, `boiler_model`, `boiler_location`.
- PDF: invoke `generate-receipt-pdf` for KN-437 after clearing the cached `receipt_pdf_url` so it re-renders rather than short-circuiting.
- UI: `src/components/engineer/CompleteSheet.tsx`, `placeholder` props on the `cs-boiler-make` and `cs-boiler-model` inputs.
