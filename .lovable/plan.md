# [BJ-XXXX] Payment bell alert reaches nobody when an org has no office/admin

Confirmed cause: the SumUp webhook ran correctly for Dublin Gas job `8ac99bfc…`
(€1230 deposit, ledger row written, WhatsApp sent), reached `notifyOffice`, then
exited at the recipient check — Dublin Gas currently has only a `superadmin` and
an `engineer` profile, so the office/admin recipient list was empty and no
`notifications` row was inserted. No error was logged, which is why it looked
like nothing happened.

Two steps, in this order. The data change is reviewed on its own.

## Step 1 — Data fix (isolated, review-gated)

Restore an active office recipient for Dublin Gas: set the intended user's
`profiles.role` to `office` (or `admin`) for organisation
`f1950683-e8b9-41cf-8972-2aa59516850d`. No schema change, no backfill of past
notifications.

Needs one decision before running: which of the two Dublin Gas users should be
the office recipient — the current `superadmin` (`a129f160…`) or the current
`engineer` (`0a338021…`, which received the last working payment alerts this
morning). Changing the engineer's role also changes what they see in the app, so
adding/promoting rather than repurposing may be preferable.

## Step 2 — Recipient fallback + loud log (code)

In `supabase/functions/sumup-payment-webhook/index.ts`, for both
`notifyOffice` and `notifyPaymentFailed`:

- Keep `office` / `admin` as the primary recipients.
- If that set is empty, fall back to active profiles in the same organisation
  with `receives_ops_notifications = true`, then to active `superadmin`
  profiles. First non-empty tier wins — never a union, so a correctly
  configured org's alerts are unchanged.
- If every tier is empty, `console.error` a single explicit line
  (`PAYMENT_ALERT_NO_RECIPIENTS job_id=… checkout_id=… org=…`) instead of
  returning silently. Money path and outcome are untouched either way.

The recipient resolution moves into a small pure helper in
`supabase/functions/_shared/` (input: rows of `{user_id, role, is_active,
receives_ops_notifications}`, output: recipient ids + which tier was used) so
the tiering is unit-testable and shared by the success and failure alerts.

## Out of scope

- No change to the dedupe read, the alert copy, `job_payments`, `buildPaymentPatch`,
  or any money arithmetic.
- No RLS change — the webhook writes with the service-role client and inserts
  already work (proven by today's 09:25 alert).
- No backfill of the missed alerts for the 14:31 / 15:00 / 15:20 / 17:02 / 17:09
  payments.

## Verification

- Unit tests on the new resolver: office/admin present → those only; none but
  ops-flagged → ops; none but superadmin → superadmin; nobody → empty + caller
  logs the no-recipient error.
- Handler tests asserting a payment on an org with no office/admin still inserts
  exactly one alert (to the fallback tier) and still returns outcome `paid`.
- Existing SumUp webhook suite must stay green, then deploy.
- Live check on a scratch job only (never a real customer): one sandbox part
  payment on Dublin Gas → exactly one bell alert, with the balance shown, and
  tapping it opens the job.
