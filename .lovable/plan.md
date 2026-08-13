# Live verification: SumUp layer-2 evidence fix (real deliveries)

Goal: produce real evidence — actual SumUp webhook payloads and real database rows — for the two scoped cases, then remove all test data. No code changes.

## Confirmed before starting

- K&N SumUp integration: `merchant_code MBBMEYG7`, `environment sandbox`, key secret `SUMUP_API_KEY`.
- Real sandbox deliveries do reach the deployed endpoint: `sumup_webhook_events` holds 3 genuine `CHECKOUT_STATUS_CHANGED` rows (KN-477, KN-470, KN-467), the most recent from today 10:50Z.

## Case 1 — mis-stamp repro (must now process)

1. Create a K&N test job through the New Job wizard, Deposit Taken, deposit €20 on a €100 total, against a clearly named test customer.
2. Record the job's `sumup_checkout_id`. Confirm `sumup_webhook_events` has zero rows for this job under any checkout id.
3. Write `deposit_paid = true` directly on the job (simulating the historical wizard mis-stamp) with `payment_status = 'unpaid'`, `paid_at = null`.
4. Pay the real sandbox hosted checkout with a SumUp sandbox test card, driven in a browser — a real payment, real webhook delivery.
5. Capture and report:
   - the actual webhook payload as SumUp sent it (from `sumup_webhook_events.payload` plus the function's request log)
   - the job row after processing: `payment_status`, `paid_at`, `balance_due`, `deposit_paid`
   - the `message_log` and `customer_activity` rows created
   - whether this matches the unit test's prediction (partial, paid_at stamped, balance_due = total − deposit, one activity row, one message row)

## Case 2 — genuine second checkout (must still be refused)

1. Same test job, first payment already processed by case 1.
2. Generate a second checkout on the job (different `checkout_id`), leaving `deposit_paid` as it now stands.
3. Pay that second sandbox checkout for real.
4. Capture and report:
   - the actual second webhook payload
   - the handler outcome from the function logs (expected `duplicate`, HTTP 200)
   - `balance_due` unchanged from the first payment; no second `message_log` / `customer_activity` row
   - the actual result of the `hasOtherClaimedEvent` query, run explicitly as a read-only query: `sumup_webhook_events` rows for this `service_call_id` where `checkout_id <> <second id>` — showing the row it matched, not just the branch taken

## Case 3 — cleanup

Delete, for the test job and test customer: `sumup_webhook_events`, `message_log`, `customer_activity`, `notifications`, the `service_calls` row, and the customer. Re-query each table to show zero remaining rows.

## Technical notes

- Payment is performed against SumUp's sandbox hosted checkout page in a headless browser using a SumUp sandbox test card; no live merchant funds involved.
- The two direct database writes needed (the mis-stamp stamp in case 1, and cleanup in case 3) are data operations on a test row only.
- Nothing in the handler, config, or frontend is modified during this verification.

## What I need from you

- SumUp sandbox test card details to complete the hosted checkout (SumUp does not publish a universal test card for all sandbox merchants; whichever card Barry's sandbox account accepts).
- Confirmation it is acceptable to create one throwaway K&N customer + job in the live database for the duration of the test, given it is deleted at the end.
