# [BJ-XXXX] Deposit payment notification — bell-only scope

Audit is done (findings in chat). This plan is the follow-on work you flagged as
"bell only, no schema change". Nothing here adds columns, changes the ledger, or
touches the BJ-0077 invoice-partials gap.

Approve when you're ready to build; skip if you'd rather stay audit-only for now.

## What changes

When a SumUp deposit or part payment settles, the office bell alert becomes
reliable and self-identifying:

1. **Deposit wording stays, amount context improves.** The alert already says
   "Deposit received — DG-443 / €150.00 paid by card (SumUp) — deposit". It gains
   the remaining balance so the office can act without opening the job:
   "€150.00 paid by card (SumUp) — deposit · €350.00 still outstanding".
2. **The alert carries its own checkout id.** Success notifications currently
   store only `source`, `amount`, `fully_paid` in metadata. Adding `checkout_id`
   (and the job reference) makes each alert traceable to the exact card attempt,
   matching what failure alerts already do.
3. **Duplicate protection of its own.** Today the success alert relies entirely
   on the upstream event claim; if that claim ever returns "unknown DB error"
   (which deliberately lets the payment through), the office can get the same
   alert twice. A dedupe read keyed on the checkout id — the same pattern the
   failure path already uses — closes that.
4. **Click-through is confirmed working, not rebuilt.** Payment alerts already
   deep-link to the job via `job_id`; no routing change needed.

## Out of scope (deliberately)

- No `status` column on the payment ledger, no backfill, no migration.
- No change to which statuses count as paid, and no change to money arithmetic.
- Partial payments still leave the invoice row untouched (BJ-0077 stays open).
- Failure alerts, timeline entries and receipts are untouched.

## Technical detail

All edits are confined to the `notifyOffice` dependency in
`supabase/functions/sumup-payment-webhook/index.ts`, plus the payload type it
receives from `supabase/functions/_shared/sumupWebhook.ts`.

- Extend the `notifyOffice` payload with `checkoutId` and `outstanding`
  (revenue minus collected-to-date minus this payment, already computed in the
  shared handler as `collectedToDate` / `fullyPaid`). No new arithmetic — reuse
  the existing values so the alert can never disagree with the ledger.
- `notifyOffice` writes `metadata: { source, amount, fully_paid, checkout_id, job_ref }`.
- Before inserting, a dedupe read mirroring `notifyPaymentFailed`:
  `.eq("job_id", …).eq("notification_type", "payment_collected").eq("metadata->>checkout_id", …)`.
  On read error, skip rather than risk a duplicate (same policy as the failure path).
- Every failure stays logged-and-swallowed: the money is already recorded, and a
  notification problem must never make SumUp retry the webhook.
- Body text is built by a small pure helper in `supabase/functions/_shared/`
  so the wording is unit-testable: deposit vs full, with and without an
  outstanding balance, and with a missing customer name.

## Verification

- Unit tests for the new body-text helper (deposit / full / no-balance / no-name).
- Unit test on the shared handler asserting `notifyOffice` receives the checkout
  id and the correct outstanding figure for a part payment on a priced job.
- Existing SumUp webhook test suite must stay green.
- Live check on a scratch job only, never a real customer: one part payment via a
  sandbox checkout, confirm a single office bell alert with the balance shown and
  that tapping it opens the job.
