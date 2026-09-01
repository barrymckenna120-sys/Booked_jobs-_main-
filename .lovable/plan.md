# BJ — DG-1012 "logged as sent, never received": evidence, root cause, fix

## Raw evidence (read-only, no messages sent)

Job DG-1012 — `service_calls.id 6924c1de-ff08-45a0-a2f2-14876f8bd8db`, Dublin Gas (`f195…850d`), created 31/08/26 17:55, Boiler Service, scheduled 01/09/26.

Customer on the job: `customers.f4b33257…` "Alan Casey", phone now `+353871111222`, `opted_out = false`, `updated_at 01/09/26 20:26:52`.
A second, older Alan Casey row also exists in Dublin Gas: `597460bd…`, phone `+353872354257` (duplicate customer record).

Two booking confirmations exist for this one job, both channel WhatsApp, both `message_log.status = 'sent'`, both `sent_by = system`, both `recipient_phone = NULL`:

```text
attempt 1  31/08/26 17:55:33   message_log 7732e8df…   status sent
           provider: 360Messenger HTTP 201, {"success":true,"statusCode":201}
           provider message id 278a2ef5-f7cd-4d91-b334-26f20af9822e
           SENT TO: +353873685111

attempt 2  01/09/26 20:27:20   message_log 77761182…   status sent
           provider: 360Messenger HTTP 201, {"success":true,"statusCode":201}
           provider message id 4751cc1e-c408-4e56-b1f3-cafc218e1c86
           SENT TO: +353871111222
```

(Destination numbers only exist in `edge_function_logs`; `message_log.recipient_phone` was never written.)

Further facts confirmed by query:
- Attempt 1 went to `+353873685111`, which matches **no customer row in Dublin Gas** — that number was on the record at booking time and was replaced by `+353871111222` on 01/09 at 20:26, one minute before attempt 2.
- Send path: `send-booking-confirmation` (free-text `POST api.360messenger.com/v2/sendMessage`), tenant credentials resolved from `tenant_integrations` for Dublin Gas — correct tenant account, no cross-tenant key use.
- Channel was WhatsApp, never SMS.
- `communication_deliveries` and `communication_delivery_attempts` are **completely empty (0 rows, all tenants)**. `send-booking-confirmation` never calls the shared `deliveryStatus` helper — only quote / invoice / receipt / renewal paths do.
- No delivery-receipt webhook function exists anywhere in the project; nothing ever ingests a 360Messenger delivery/read status.
- No `whatsapp_messages` row for this customer.

## Root cause

Three separate defects, none specific to DG-1012:

1. **Provider *accept* is recorded as *sent*.** 360Messenger's `HTTP 201 / success:true` means "request queued", nothing more. `send-booking-confirmation` writes `message_log.status = 'sent'` and returns `success:true` on that alone. There is no state between "accepted" and "delivered", so a queued-then-dropped message is indistinguishable from a delivered one.
2. **No delivery confirmation is ever ingested.** There is no webhook endpoint, so `delivered` can never be observed and a silent non-delivery (invalid number / number not on WhatsApp / provider drop) is invisible.
3. **Booking confirmations are outside the delivery-status system.** Because this path never writes `communication_deliveries`, DG-1012 can never show `⚠ Not delivered`, can never appear in Admin → Communication Delivery Issues, and can never trigger the Office Manager failure alert — even if the send had returned a hard error.

Contributing data issue: a duplicate Alan Casey customer record plus a phone edit mid-life means the confirmation the customer would have expected went to `+353873685111`, a number no longer on file. `message_log` does not record the destination, so the office cannot see this at all.

**Scope: this is shared cross-tenant logic, not a DG-1012 one-off.** Every WhatsApp send path that keys success off the 201 response has the same flaw; every path not wired to `deliveryStatus.ts` is invisible to the badges/admin log.

## What we will change

### 1. Honest status vocabulary (shared)
Extend the delivery status set to `pending | accepted | sent | delivered | failed | opted_out`.
- `accepted` = provider took the request (today's 201). This is what a fresh send lands on.
- `delivered` = a delivery receipt arrived.
- Office App copy: `accepted` renders as **"Sending…"**, not a success tick. `delivered` renders "Delivered · WhatsApp". Nothing shows as confirmed-sent on an accept alone.
- `failed` badge, Admin log entry and Office Manager alert rules stay exactly as specified today.

### 2. Booking confirmations join the system
Wire `send-booking-confirmation` through `beginDelivery` / `completeDelivery` / `markOptedOut` with `comm_type = 'booking_confirmation'`, `related_type = 'service_call'`, `related_reference = job_reference`, and the **actual destination number** as `recipient`. Also write `message_log.recipient_phone` on this path so the office can always see where a message went.

### 3. Delivery receipts
Add a `whatsapp-delivery-webhook` edge function (`verify_jwt = false`, shared-secret validated) that maps a 360Messenger status callback onto the delivery row by provider message id: `delivered` → `delivered`, hard failure → `failed` (which then follows the existing alert + Admin log rules). Store `provider_message_id` on the attempt at send time so callbacks can be matched.

### 4. Stale-accept sweep
A scheduled check marks an `accepted` communication as `failed` with reason "No delivery confirmation received" after a defined window (proposed: 6 hours), so silent drops surface instead of sitting forever as "Sending…".

### 5. DG-1012 itself
Backfill a delivery record for DG-1012 reflecting reality: two attempts, both provider-accepted only, no delivery confirmation → current status `failed` / "No delivery confirmation received", so the office sees `⚠ Not delivered` and it appears in the Admin log. Also flag the duplicate Alan Casey customer rows for office merge. No new message is sent to Alan Casey.

## Rollout order (each step verified before the next)

1. Migration: status vocabulary + `provider_message_id` matching index (DB write step on its own)
2. Shared helper + Office App copy for `accepted` / `delivered`
3. `send-booking-confirmation` wired in; verify end-to-end on a controlled test number in Cavan Gas
4. Delivery webhook + provider-side callback configuration; verify a real `delivered` transition on the test number
5. Stale-accept sweep
6. DG-1012 backfill (isolated DB write step, idempotent, read-back reported)
7. Acceptance pass on two tenants: accept-only, delivered, hard failure, resend-success, opt-out, cross-tenant 403, historical rows render nothing

## Technical notes

- Every other WhatsApp send path still treats 201 as success. Once the vocabulary lands, those paths get migrated one function per step, wording byte-for-byte preserved.
- `provider_error` stays admin-only; the office only ever sees `failure_reason_public`.
- Test sends use controlled scratch numbers only — never Alan Casey or any other real customer.
