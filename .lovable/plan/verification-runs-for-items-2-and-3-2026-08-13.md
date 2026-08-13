# Verification runs for items 2 and 3

Item 1 is already answered from code and git history — no further work needed there.

Items 2 and 3 cannot be done read-only. Both require writing real rows and, for item 3, creating a live SumUp checkout and sending a real WhatsApp message. Approve this and I will run them exactly as described below, then remove the test data.

## Item 2 — "Invoice After" with toggle on

Goal: prove `send-deposit-link` is never called when payment status is not "Deposit Taken", even with a deposit amount present and the toggle on.

1. Create a K&N test customer and drive the New Job wizard in the preview to Step 4 with:
   - Payment Status = Invoice After
   - a deposit amount greater than zero entered first (switch status to "Deposit Taken", type the amount, then switch to "Invoice After") so the value is genuinely in state
   - the "Send deposit payment link" toggle left on before switching status
2. Submit, and capture from the browser console whether `send-deposit-link` was invoked, plus the network panel for any call to it.
3. Query and show the results for the created job:
   - `service_calls` row: `id, payment_status, deposit_amount, payment_link, sumup_checkout_id`
   - `message_log` rows for that `related_id`
   - `send-deposit-link` edge function logs for the test window
4. Expected: no invocation, `payment_link` and `sumup_checkout_id` both null, zero `message_log` rows. I will report whatever actually happens, including a negative result.
5. Delete the test job, test customer, and any rows created.

## Item 3 — accept-quote end to end after extraction

Goal: confirm quote acceptance still produces a checkout, a WhatsApp send, and the same database side effects as before the extraction.

1. Create a K&N test customer and a test quote with a deposit amount.
2. Accept it through the public quote page so the real `accept-quote` function runs (post-extraction, post catch-type-fix).
3. Capture and show:
   - the WhatsApp message as sent, from the `message_log` row and the 360 Messenger response
   - the converted job row: `payment_link`, `sumup_checkout_id`, `deposit_amount`, `organisation_id`
   - the `message_log` row: `message_type`, `status`, `organisation_id`, `related_id`
   - the `customer_activity` entry
   - `accept-quote` edge function logs, including confirmation the deposit task ran under `EdgeRuntime.waitUntil` after the response returned
4. Compare each against the pre-extraction shape and state explicitly whether anything differs.
5. Delete the test quote, job, customer, message log, and activity rows.

## Notes

- Test phone number: I need one you are happy to receive a real WhatsApp on for item 3, since the send is live. Tell me which number to use, or confirm I should use a number already on a K&N test customer.
- K&N SumUp is still on the sandbox merchant (`MBBMEYG7`), so item 3's checkout will be a sandbox checkout, not a live one.
- No code changes in either item. If a defect turns up, I will report it and stop.
