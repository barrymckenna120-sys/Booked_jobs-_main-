# BJ-0044 — SumUp deposit decline: evidence found, and what to fix in the audit prompt

## The job you were looking for

You don't need to hunt for it — I already have it from the K&N data for today:

- **KN-480 — Aisling Power (+353892109224)** — created 13/08/26 at 17:03 UTC (18:03 local)
- Total EUR 22, deposit EUR 11, checkout id `90cc2c77-613c-4041-afdc-43fdf373682f`
- Both WhatsApps went out and were accepted by 360Messenger at 17:03:09 (booking confirmation) and 17:03:12 (payment link) — `message_log` status `sent`, no error
- The SumUp webhook then arrived twice at 17:03:56 with status **FAILED**

## Correction to one premise in the report

The job **was** saved and is **not** cancelled. `service_calls` KN-480 is present, `status = 'Booked'`, `payment_status = 'unpaid'`, `deposit_paid = false`, `cancelled_at = null`. So this is not a data-loss bug — it is a visibility bug. What Karl/Barry saw as "not saved / cancelled" is most likely the job appearing unpaid with no confirmation of the failed payment anywhere in the office UI. The audit should establish what the office screen actually showed for KN-480, rather than assume the row was lost.

## Confirmed cause of "no alert on office side"

In the shared webhook handler, a non-paid status returns early:

- it logs `checkout ... status FAILED — no payment recorded` and returns outcome `not_paid` with HTTP 200
- that return happens **before** the event-claim step, so **no `sumup_webhook_events` row is written** for a decline (confirmed: zero rows for KN-480 / that checkout id)
- it is also before any notification or message write, so no `payment_collected`-style office notification and no failure notification is produced

So there is no decline path that "isn't firing" — there is no decline path at all. That is the gap.

## Gaps in your audit prompt

1. **Item 2 can't be answered as written.** `sumup_webhook_events` has only `id, checkout_id, event_type, organisation_id, service_call_id, created_at`. There is no `payload`, no `status`, no `processed` column. Ask instead for the raw request body from the function logs, and note that any decline never reaches this table.
2. **Add: what did the office actually see?** Query the job row and ask which Schedule / Job Detail / Finance surface would render it, so "appears cancelled" is either reproduced or ruled out. Without this the ticket has no confirmed user-visible symptom.
3. **Add: the failed-attempt is invisible by design.** Ask explicitly whether any table records a declined attempt at all (it does not) — that is the decision to make before any fix.
4. **Add: was it retried?** Two FAILED deliveries landed for the same checkout. Ask whether the customer retried and succeeded, or the checkout is now dead and the deposit is still owed with a stale link.
5. **Add: what happens next for the customer.** With deposit unpaid and the checkout FAILED, is the existing `payment_link` still usable or does the office need to reissue? That drives the eventual fix shape.
6. **Drop/narrow item 1.** No need to hunt for partial/soft-deleted rows — the row exists and I've shown it.
7. **Fold in BJ-0044b context.** The success screen now reports actual send outcomes; both sends here genuinely succeeded, so the WhatsApp side is not implicated and can be stated rather than investigated.

## What I'd run in the audit (read-only)

- KN-480 full `service_calls` row, its customer, and the two `message_log` rows (done — findings above)
- Full raw webhook request bodies for both 17:03:56 deliveries from the function logs
- The `not_paid` code path in `_shared/sumupWebhook.ts` and `sumup-payment-webhook/index.ts`, quoted, showing exactly where it returns before claim/notify
- `notifications` for K&N in the window, to show zero rows tied to KN-480
- Whether the SumUp checkout `90cc2c77-...` is still payable or terminal
- Which office surfaces render an unpaid Booked job with a failed deposit, to pin down the "appears cancelled" report

No code changes, no migrations. Output is a findings report plus a recommended fix scope for a separate ticket.
