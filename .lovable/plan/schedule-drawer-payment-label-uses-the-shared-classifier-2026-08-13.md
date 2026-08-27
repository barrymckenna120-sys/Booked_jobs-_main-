# Schedule drawer: payment label uses the shared classifier

## Problem

`src/components/schedule/JobSlotDrawer.tsx:166-169` renders the Payment field from `deposit_paid` alone:

```text
job.deposit_paid ? "Paid" (green) : "Unpaid" (amber)
```

KN-474 has `deposit_paid = true`, `payment_status = 'unpaid'`, `revenue = 1000`, `deposit_amount = 500`, `balance_due = 500`. The drawer therefore reads "Paid" in green even though €500 is still owed. `resolvePaymentSheetState` classifies the same row as Case A (deposit paid, balance remains), so the drawer contradicts the shared classifier and the Job Detail badge, which already reads "Deposit Paid — Balance Due".

## Change

Presentation only, one file.

- `JobSlotDrawer.tsx` calls `resolvePaymentSheetState(job)` and maps the case to the label:
  - Case B -> "Paid" (success)
  - Case A -> "Deposit Paid — €X due" (warning)
  - Case D -> "Deposit €X due" (warning)
  - Case C -> "Unpaid" (warning)
- Wording and tones mirror the existing Job Detail badge and the engineer card pill, so all three surfaces agree.
- The drawer's job object already carries `revenue`, `deposit_paid`, `deposit_amount`; `Schedule.tsx`'s mapping is checked for `payment_status`, `deposit_required` and `balance_due` and those fields are passed through if absent — no query or business-logic change.

## Out of scope

- The underlying data question (why `deposit_paid = true` with no SumUp webhook received for checkout `4aca6cf0…`).
- WhatsApp deposit message body.
- Any write path, RLS, or edge function.

## Verification

- KN-474 in the schedule drawer reads "Deposit Paid — €500.00 due" in amber, not green "Paid".
- A fully paid job still reads "Paid" in green.
- A plain unpaid job with no deposit still reads "Unpaid".
