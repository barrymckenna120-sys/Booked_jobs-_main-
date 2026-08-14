# Payment Failed on the Activity Timeline

A declined SumUp deposit currently raises an office notification but leaves no trace on the customer's Activity Timeline. This adds exactly one new write: a red "Payment Failed" entry in the same timeline as the existing "Payment Received" entries.

Untouched: the payment_failed notification insert, the payment_received activity writes, `notify_on_job_change()`, and every other insert site. No new table or column. No write added to Job Detail — the activity log stays customer-profile-only.

## Files changed

### 1. `supabase/functions/_shared/sumupWebhook.ts`
- Widen the existing `logActivity` dependency's entry type so it can carry `eventType` and `eventData` (defaulting to today's `payment_received` behaviour on the success path, which stays byte-identical in effect).
- In the terminal-failure branch (~lines 338-362, where `deps.notifyPaymentFailed` is already called), call the same `deps.logActivity` with `eventType: "payment_failed"` before the `not_paid` return.
- Label mirrors the existing `payment_received` phrasing convention:
  `Payment failed — €{amount} — Card (SumUp) — {Declined|Expired|Cancelled}{ — deposit when not fully paid}`
- Side-effect only: never changes the returned outcome or HTTP status; any throw is caught and logged. Skipped when the job has no `customer_id` (`customer_activity.customer_id` is `NOT NULL`).
- Extend the existing unit-test suite: FAILED/EXPIRED/CANCELLED each log once with the right label, PAID logs only `payment_received`, non-terminal/unknown status logs nothing, null customer skips, and a throw inside the dep leaves the outcome unchanged.

### 2. `supabase/functions/sumup-payment-webhook/index.ts`
- Teach the existing `logActivity` implementation to honour the passed `eventType`/`eventData` (default remains `payment_received`), and to write `event_data: { source: "sumup", checkout_id, status }` for the failure case.
- Idempotency guard using the same reasoning as `notifications_payment_failed_once` — key on the checkout, not on job state. Before inserting, look for an existing `customer_activity` row with the same `service_call_id`, `event_type = 'payment_failed'` and `event_data->>'checkout_id'` equal to this checkout; skip when found. That distinguishes a duplicate webhook delivery of one attempt (skip) from a genuinely separate second decline on a new checkout (logged).
- Redeploy the function.

### 3. `src/components/customer/CustomerActivityTimeline.tsx`
- Add a `payment_failed` entry to `PILL_CONFIG`: label "Payment Failed", red/rose treatment consistent with the red `XCircle` used for the payment_failed notification in the bell, rather than the grey "Note" fallback.

## Verification and reporting

- Run the sumupWebhook unit suite.
- Replay a signed terminal-failure webhook delivery against a K&N sandbox test job (reusing the two existing test declines if still reproducible, otherwise a fresh test job), then replay the identical delivery a second time.
- Report the diff for all three files plus the raw `customer_activity` row(s) from a `SELECT *` — exactly one row for the attempt, with its actual `event_label` and `event_data` — and a screenshot of the red pill on that customer's profile. Test data removed afterwards.
