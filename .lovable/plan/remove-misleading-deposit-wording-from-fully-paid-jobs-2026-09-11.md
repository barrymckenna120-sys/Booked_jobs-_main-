# Remove misleading deposit wording from fully paid jobs

## Goal
Keep DG-1019’s audit data unchanged while ensuring a fully settled job is presented as a full payment everywhere staff or customers can see it. A genuine part-paid deposit must continue to say “Deposit Paid” with the remaining balance.

## Expected behaviour
- **Fully paid:** show “Fully Paid”, “Payment Complete”, “Amount Paid”, or “Total Paid” as appropriate; never describe the full €1,537.50 as a deposit.
- **Real deposit with money outstanding:** keep “Deposit Paid” and the correct balance due.
- **Deposit still due:** keep the existing deposit-required wording.
- **No payment data:** preserve the existing unpaid/empty states.

## Implementation
1. Add a small tested presentation helper based on the existing shared payment classifier, with settled status / zero balance taking precedence over historical `deposit_paid` and `deposit_amount` fields.
2. Apply that presentation state only to job-facing payment summaries that can currently render deposit wording from those historical fields, including the office payment summary and invoice preview.
3. Preserve existing correct surfaces:
   - Job Detail already shows “Fully Paid” when `payment_status = paid`.
   - Schedule already shows “Paid” for the settled case.
   - Engineer job cards/details suppress the deposit pill for the settled case.
   - Customer Payment History and receipts show amount/method only and do not expose `payment_type`.
4. Do not alter DG-1019 or any other database row, payment calculation, ledger entry, receipt, route, permissions, or payment workflow.

## Verification
- Add regression coverage for a DG-1019-shaped job: `payment_status=paid`, `balance_due=0`, `deposit_paid=true`, and `deposit_amount` equal to the job total.
- Confirm it never produces a visible “Deposit Paid” label.
- Confirm a genuine partial-deposit job still shows “Deposit Paid” plus its outstanding balance.
- Check Office and Engineer job/payment views at mobile and desktop widths, with no console errors.
- Run the focused tests, full test suite, typecheck, and diff check.

## Risk
Low UI risk. The shared classifier already distinguishes fully paid from partially paid jobs; this change only makes remaining labels follow that existing state. Payment writes and historical audit fields remain untouched.
