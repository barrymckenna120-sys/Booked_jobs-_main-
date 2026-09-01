# Communication Delivery Status — cross-tenant system

This is a large, cross-cutting feature touching quotes, invoices, receipts, reminders, WhatsApp/email send paths, tenant isolation and office notifications. It is built once as a shared system and then wired into send paths in batches, so nothing ships half-verified.

## What it does

Office managers see delivery problems where they already work: a small `⚠ Not delivered` badge on the quote/invoice/job row, with a Resend action. Opt-outs show as a separate, non-error state. Failures also email the tenant's office manager and appear in a platform Admin failure log. One set of records feeds all three surfaces.

## Core data model (one source of truth)

New table `communication_deliveries` — the current state, one row per logical communication:

- tenant: `organisation_id` (server-derived, never client-supplied)
- what: `comm_type` (quote/invoice/receipt/service_reminder/...), `related_type`, `related_id`, `customer_id`
- channel: `whatsapp` | `email` | `sms`
- `delivery_status`: `sent` | `failed` | `opted_out` (`pending` while in flight)
- recipient used, first attempt time, last attempt time, delivered time
- `failure_reason_public` (human readable) and `provider_error` (admin only)
- `attempt_count`, `resolved_at` (set when a later resend succeeds)

New table `communication_delivery_attempts` — append-only audit of every attempt (attempt number, outcome, timestamps, recipient, public reason, provider error/message ID, who triggered it). Existing rows are never overwritten.

RLS: tenant users read/act only within `get_my_org_id()`; `provider_error` is never returned to tenant users (exposed through a security-definer function/view restricted to superadmin). Attempts are insert-only from server code (service role). Explicit GRANTs on both tables.

Existing `message_log` / `whatsapp_messages` stay as-is; the new tables sit alongside and are written from the same shared helper, so no wording or existing behaviour changes.

## Shared server helper

`supabase/functions/_shared/deliveryStatus.ts`:

- `beginDelivery(...)` → creates/updates the delivery row + a new attempt row (`pending`)
- `completeDelivery(attemptId, result)` → records the real send outcome only (never "UI succeeded")
- `markOptedOut(...)` → `opted_out`, no failure alert
- maps provider errors to a short human reason (invalid number, not on WhatsApp, provider rejected, mailbox rejected, no contact details, ...)

Send paths call this helper; opt-out is checked before sending, as today.

## Resend

New edge function `resend-communication`:

1. auth + org derived server-side from the record (403 on cross-tenant)
2. re-reads current customer contact details
3. re-checks opt-out → returns `opted_out`, no send
4. dispatches through the existing per-type send function
5. writes a new attempt and updates the current status from the real result

Duplicate-tap protection: server-side in-flight guard on the delivery row plus a disabled/"Sending…" button state.

## Office App UI

- `DeliveryStatusBadge` + `ResendButton` (shared components, styled like the existing payment warning banner language)
- Wired into: Quotes list & Quote detail, Invoices/Finance rows & Job detail, Receipts, Renewals/Service reminder rows
- Missing delivery record (historical rows) renders nothing — safe by design
- Opt-out shows `Reminder not sent – customer opted out`, no Resend
- Works on mobile and desktop layouts

## Office manager alert email

- Trigger on a confirmed `failed` attempt (never on `opted_out`)
- Sent via Resend to the tenant's configured office manager email, tenant resolved server-side from the record
- Keyed on the attempt ID → duplicate events/webhooks/refreshes cannot double-send
- Immediate mode by default for quotes and invoices; hourly digest mode supported
- Fully separate from the existing 500-error digest
- Contains customer name, type, reference, channel, time, human reason and a link to the record — no unnecessary customer data

Tenant settings (new columns on the tenant settings table): alerts enabled, mode (immediate/hourly), per-type toggles for quotes/invoices/receipts/service reminders. Defaults: enabled + immediate for quotes and invoices.

## Admin Panel — Communication Delivery Issues

New superadmin-only tab: tenant, customer, channel, type, reference, status, reason, date/time, attempts, latest result. Filters: tenant, channel, status, type, date range, customer, reference, plus a "unresolved failures" quick filter. Detail view shows the full attempt history and the raw provider error. Permissions enforced server-side (security-definer function gated on superadmin), not by hiding UI.

## Rollout order (each step verified before the next)

1. Migration: tables, RLS, GRANTs, settings columns (DB write step on its own)
2. Shared helper + resend function + alert function
3. Wire WhatsApp quote path end to end; verify on the Cavan Gas test tenant
4. Wire invoices, receipts, service reminders
5. Office UI badges + resend
6. Admin panel log
7. Acceptance pass across two tenants (K&N + Cavan/Dublin Gas): success, failure, resend-fail, resend-success, opt-out, double-tap, refresh, cross-tenant 403, historical rows

## Notes

- No Dublin Gas specific logic anywhere; everything resolves by `organisation_id`.
- No changes to existing message wording or to payment logic.
- Test sends use scratch jobs/test numbers only, never real customers.
