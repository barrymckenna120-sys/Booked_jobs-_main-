# Fix Finance search and clarify receipt access

## Confirmed current behaviour

- The search field is on **Finance → Sales** and currently compares only the customer name. Searching by job reference (`DG-1019`) or receipt number (`DG-2026-2899`) therefore returns no result, even when that payment is in the selected period.
- A no-match search incorrectly says “No completed jobs for this period,” which makes a working date range look empty.
- The completed-payment screen is a reusable route keyed by the job ID, not a one-time post-payment screen. DG-1019 can be opened directly at `/receipt-view/edc1f2dc-3082-4726-9187-7903d008e0aa` while signed in.
- Existing navigation paths include:
  - **Finance → Sales → View** in the Receipt column.
  - **Jobs list → receipt number**.
  - **Customer → Service History → receipt number**.
  - The Engineer job card when a receipt exists.
- The Office job detail page currently shows payment information but has no direct “View Receipt” action.

## Implementation

1. Extend the Finance Sales data used by search to include the job reference.
2. Make the search case-insensitive and whitespace-tolerant across:
   - customer name
   - job reference
   - receipt number
   - invoice number
3. Keep the existing date range and all other filters unchanged; search only filters the rows already loaded for that period.
4. Show a search-specific empty message when no rows match, while preserving the existing period-empty message when no search or filters are active.
5. Add a small pure search helper with regression tests for DG-1019, DG-2026-2899, customer names, invoice numbers, casing, whitespace, and no-match behavior.
6. Add a direct **View Receipt** action to the Office job detail payment section when `receipt_number` exists, using the existing receipt route. No payment, receipt-generation, permissions, or completion logic changes.

## Verification

- Confirm Finance → Sales finds the same row using `DG-1019`, `DG-2026-2899`, and the customer name.
- Confirm searches combine correctly with date, payment, status, job-type, and engineer filters.
- Confirm no-match and no-data states use the correct messages.
- Open DG-1019 from both Finance and its job page; confirm “Payment Successful,” “Download PDF Receipt,” and the certificate action render.
- Check desktop and mobile widths, console errors, focused tests, full tests, typecheck, and diff validation.

## Risk

Low. This changes client-side filtering and adds navigation to an already-authorized receipt screen; no payment data, database rules, tenant isolation, or payment workflow changes.
