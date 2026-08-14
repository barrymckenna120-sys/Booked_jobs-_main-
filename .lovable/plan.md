# Payment Failed on the Activity Timeline

Today a declined SumUp deposit raises an office notification but leaves no trace on the customer's Activity Timeline — so anyone opening the profile later sees a booked job with no record that a payment attempt happened. This adds a red "Payment Failed" entry alongside the existing "Payment Received" ones.

## What changes

1. **Write a failure entry** when a SumUp checkout ends in a terminal failure (declined, expired, cancelled). The entry sits in the same timeline as successful payments and reads, for example:
   `Payment failed — €150 — Card declined (SumUp)`
2. **Render it in red** in the Activity Timeline on the customer profile, matching the destructive styling already used for the Payment Failed notification.
3. **One entry per failed checkout** — a repeat webhook delivery for the same checkout does not add a second row.

Out of scope: no change to the existing payment_failed notification, to `notify_on_job_change()`, to successful-payment entries, or to any other event type. No new database table or column.

## Technical detail

**`supabase/functions/_shared/sumupWebhook.ts`**
- Add an optional `logFailedActivity` dependency alongside the existing `notifyPaymentFailed`, invoked from the same terminal-failure branch (~line 346), before the `not_paid` return. Purely a side effect: it never alters the returned outcome or HTTP status, and any throw is caught and logged.
- Payload: `organisationId`, `customerId`, `serviceCallId`, `amount`, `status`, `checkoutId`.
- Skipped when the job has no `customer_id`, since `customer_activity.customer_id` is `NOT NULL`.
- Extend the existing unit-test suite with cases for: FAILED/EXPIRED/CANCELLED each logging once, PAID not logging a failure, non-terminal/unknown status logging nothing, null customer skipping the write, and a throw inside the dep not changing the outcome.

**`supabase/functions/sumup-payment-webhook/index.ts`**
- Implement `logFailedActivity` next to the existing `logActivity`, inserting into `public.customer_activity`:
  - `event_type: "payment_failed"`
  - `event_label`: `Payment failed — €<amount> — <reason> (SumUp)`, where reason is derived from status (declined / expired / cancelled), mirroring the wording already used in `notifyPaymentFailed`.
  - `event_data: { source: "sumup", checkout_id, status }`
  - `created_by: null`
- Idempotency guard mirroring the notification dedup: before inserting, check for an existing `customer_activity` row for this `service_call_id` with `event_type = 'payment_failed'` and `event_data->>'checkout_id'` equal to this checkout. If found, skip.
- Redeploy the function.

**`src/components/customer/CustomerActivityTimeline.tsx`**
- Add a `payment_failed` entry to `PILL_CONFIG` so it renders as a red pill labelled "Payment Failed" rather than falling back to the grey "Note" pill. Existing entries in this map use raw colour utilities; the new one will use the destructive design token to stay theme-correct.

**Verification**
- Unit tests for the webhook branch (`bunx vitest run` on the sumupWebhook suite).
- Simulate a signed FAILED webhook delivery against a K&N sandbox test job, confirm exactly one `customer_activity` row with `event_type = 'payment_failed'`, replay the same delivery and confirm no second row, then confirm the red pill renders on that customer's profile and remove the test data.
