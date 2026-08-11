# Publish and live-verify the payment amount fix

No code changes. This is a publish + verification pass on what is already built.

## Steps

1. Run a security scan check, then publish (Update) so the live app includes the
   `paymentSheetAmount.ts` / `PaymentSheet.tsx` / `TakePaymentModal.tsx` changes.
2. Wait for the deploy to serve, then open the running app and find a Case A job
   (`deposit_paid = true` with a positive balance due — KN-465 shape).
3. Open the engineer PaymentSheet on that job and confirm the amount label reads
   "Balance Due (€)" pre-filled with the outstanding balance, not "Job Total (€)"
   with full revenue.
4. Open TakePaymentModal on the same job and confirm the same label and amount.
5. Report findings with screenshots. No payment is submitted during the check.

## Technical notes

- Publish via the publish tool; frontend changes only reach the live domain after this.
- Verification driven by Playwright against the running app using the injected
  session; read-only navigation, no writes, no payment capture.
- If no live Case A job exists, I will report that instead of altering data.
