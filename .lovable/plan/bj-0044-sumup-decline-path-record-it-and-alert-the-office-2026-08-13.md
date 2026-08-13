# BJ-0044 — SumUp decline path: record it and alert the office

Scope: the decline path only. No changes to the notification bell architecture, no `role` back-filling, no relabelling of the seven unlabelled notification types.

## What's wrong today

In `_shared/sumupWebhook.ts` a verified non-paid status returns at line 320 (`outcome: "not_paid"`) before the event claim, before any job write, and before `logActivity` / `logMessage` / `notifyOffice`. A declined deposit therefore writes nothing anywhere: KN-480 has zero `sumup_webhook_events` rows, no `message_log` payment row, and no notification. The office has no way to learn the customer tried and failed, and the job keeps a `payment_link` pointing at a checkout SumUp now reports as `FAILED`.

## The change

**1. `supabase/functions/_shared/sumupWebhook.ts`**
- Add one optional dep: `notifyPaymentFailed?: (entry: { organisationId, serviceCallId, customerId, jobReference, checkoutId, status, amount }) => Promise<void>`.
- In the existing `!PAID_STATUSES.has(status)` block, before returning, call it when the status is a **terminal failure** — `FAILED`, `EXPIRED`, `CANCELLED` — and skip it for in-flight statuses (`PENDING`, unknown/empty), so a normal pre-payment callback stays silent.
- Keep the return exactly as it is: `{ outcome: "not_paid", status: 200, jobId: job.id }`, HTTP 200. Failures inside `notifyPaymentFailed` are caught and logged, never fatal — a decline must not trigger SumUp retries.
- Nothing else moves. No job patch on this path, no `claimEvent` call, no `sumup_webhook_events` write (its `checkout_id` is UNIQUE and drives idempotency; claiming a decline there would block a later genuine payment on the same checkout).

**2. `supabase/functions/sumup-payment-webhook/index.ts`**
- Implement `notifyPaymentFailed` with the service-role client, mirroring the existing `notifyOffice` block: resolve office/admin recipients for the job's organisation, resolve the customer name, insert one `notifications` row per recipient with `notification_type: 'payment_failed'`, `job_id`, `organisation_id`, `role: 'office'`, and metadata `{ source: 'sumup', checkout_id, status, amount }`.
- Title: `Payment failed — KN-480`. Body names the amount, the customer, and states the payment link is no longer usable and a new one must be sent.
- Dedupe: SumUp delivered this event twice. Before inserting, check for an existing `payment_failed` notification for the same `job_id` with the same `metadata->>checkout_id`; if present, skip. Any error from that check means skip the insert rather than risk duplicates, and it is logged.

**3. Renderers — one line each, so the alert isn't mislabelled**
`NotificationDrawer.tsx`, `NotificationToast.tsx`, `NotificationBanner.tsx` and the `NotificationType` union in `useNotifications.ts` get a `payment_failed` entry (destructive-coloured `XCircle`, label "Payment Failed"). Without it the drawer's `typeConfig[...] || typeConfig.new_job` fallback would show a payment failure as a green wrench labelled "NEW JOB". No other renderer behaviour changes.

## Tests

`_shared/sumupWebhook.test.ts` — added Deno cases:
- `FAILED` → `notifyPaymentFailed` called once with the right job/checkout/status; `updateJob`, `claimEvent`, `logActivity`, `logMessage`, `notifyOffice` never called; result stays `not_paid` / 200.
- `PENDING` and unknown status → `notifyPaymentFailed` not called, result unchanged.
- `notifyPaymentFailed` throwing → still `not_paid` / 200, no writes.
- `PAID` → unchanged from today (regression guard on the money path).

## Verification

- Re-run the existing suite plus the new cases.
- Replay the two real KN-480 FAILED payloads against the deployed function with the correct secret, then show: the `notifications` rows created (exactly one per office recipient, not two per recipient), KN-480 still `Booked` / `unpaid` / `paid_at NULL` / `balance_due 11` and otherwise byte-identical, and `sumup_webhook_events` still empty for that checkout.
- Confirm the alert renders as "Payment Failed" in the bell, not "New Job".
- Delete any notification rows created purely by the replay.

## Deliberately out of scope

- Clearing or invalidating `service_calls.payment_link` for a dead checkout — that is a money-path data write and belongs in its own ticket. The notification tells the office the link is dead instead.
- `role = NULL` on existing `payment_collected` rows hiding them from the Office tab.
- Icons/labels for `schedule_update`, `message`, `en_route`, `on_site`, `in_progress`, `new_repair`, `whatsapp_reply`.

## Risk

Medium — touches the money-path handler, but only adds a side effect on a branch that currently does nothing, and leaves that branch's return value and HTTP status untouched. No schema change, no migration.
