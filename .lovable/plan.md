# Communication Delivery Status (all tenants)

Goal: failed customer communications become visible in the Office App workflow, resendable in one tap, and emailed to the tenant's office manager — built once and shared by every tenant.

This touches quotes, invoices, receipts and reminders, so it is staged: each stage is independently revertible and verified against two tenants (K&N + Dublin Gas) before the next.

## 1. Data model (one migration per concern)

Reuse the existing `message_log` table as the **delivery-attempt history** (it already carries organisation_id, channel, status, error_message, related_id/related_type, recipient_phone). Additions:

- `message_log`: `delivery_status` (`sent` | `failed` | `opted_out`), `failure_reason` (human-readable), `attempted_at`, `delivered_at`, `recipient` (channel-agnostic), `attempt_no`, `resend_of` (self FK), `alerted_at`.
- `delivery_status` + `delivery_status_at` + `delivery_failure_reason` columns on `quotes`, `invoices`, `service_calls` (receipts/reminders live on the job) — nullable, so historical rows render as "no status" and never as failed.
- A trigger keeps the parent record's columns equal to the latest attempt for that `related_id`/`related_type`; history is never overwritten.
- `organisations`: `delivery_alert_settings` jsonb — `{ enabled, mode: immediate|hourly, types: { quotes, invoices, receipts, reminders } }`, defaulting to enabled+immediate for quotes and invoices.
- GRANTs + RLS on every new/changed table: read/write scoped to `get_my_org_id()`, so Tenant A can never read or resend Tenant B's rows. Explicit RLS check for delivery status, recipient, failure reason and resend paths.

## 2. Shared send layer

One helper module used by every send path (`supabase/functions/_shared/deliveryStatus.ts`):

- `recordAttempt()` — writes the attempt row and derives the human-readable reason from the provider error (raw provider text stored but never surfaced to office users).
- `checkOptOut()` — respects the Customer Profile service-reminder opt-out and any other preference; returns `opted_out` instead of attempting a send, and is never treated as a failure.
- Status is written from the actual provider response, never from "the request completed".

Wired into the existing quote / invoice / receipt / reminder send functions — no per-screen logic.

## 3. Office App UI

- Shared `DeliveryStatusBadge` + `ResendButton` pair, styled with the same visual language as the existing payment warning banner.
- `⚠ Not delivered — SMS failed` beside quote/invoice/job rows and in their detail views, on mobile and desktop.
- Opted out renders as `Reminder not sent – customer opted out` with no Resend action while the opt-out is on.
- Resend: single-flight guard (disabled + "Sending…" while in flight), verifies current contact details and opt-out server-side, then updates from the real result. Success clears the warning; failure keeps it with a readable reason. Status survives refresh because it is read from the database.

## 4. Office manager failure alert

New edge function `notify-delivery-failure`, entirely separate from the 500-error digest:

- Triggered when an attempt is written as `failed`; resolves the tenant from the affected record server-side (never a client-supplied org id) and uses that tenant's configured office manager email.
- Sent via Resend, per project convention.
- Email body: customer, type, reference, channel, status, time, human-readable reason, plus a secure link back to the record. No unnecessary customer detail.
- Idempotent on the attempt id (`alerted_at`), so retries, refreshes and duplicate webhook events cannot double-send. A new failed attempt (including a failed manual resend) does produce a new alert.
- `opted_out` never alerts.
- Hourly mode batches unalerted failures into one digest per tenant.

## 5. Verification (evidence, not self-report)

Run on K&N and Dublin Gas scratch records only — no real customer numbers or emails:

- quote sent → `sent`; forced failure → `failed` + badge; resend success → clears; resend failure → stays failed
- same for invoice, receipt, service reminder
- opt-out customer → `opted_out`, no alert, no Resend action
- double-tap → one send
- refresh → status unchanged
- Tenant A session cannot read or resend Tenant B rows (direct query + endpoint attempt)
- historical rows with no status still render

Each stage closes on a SQL read-back or screenshot.

## Notes

Nothing is hard-coded per tenant; Dublin Gas gets this through the shared path. No changes to `vite.config.ts`, service-worker config, `PWAUpdateBanner.tsx`, or payment amounts/logic.
