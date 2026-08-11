# Make SumUp deposits visible: Finance, notifications, quote timeline

Three gaps found in the audit, all stemming from the same thing: a SumUp deposit lands on the job row silently, with no payment date, no notification, and no trace on the quote.

## 1. Finance → Sales shows part-paid deposits

Today a deposit-only payment has no `paid_at` (the webhook only stamps it on a full payment) and no `invoiced_at`, so both tables on the Sales tab drop it.

- Stamp a payment date on partial payments too, so the Sales list can find and date them.
- Keep double-charge protection intact: the "already paid" guard stops relying on the date field and keys off payment status only, so a later balance payment on the same job still processes.
- Outstanding Balances stops requiring "invoiced or invoice method". It will also include jobs where money has been taken and a balance remains, so a €246 deposit on a €492 job shows €246 outstanding.
- Backfill KN-465 (quote Q-2026-0115) so Barry's existing €246 appears without waiting for a new payment.

## 2. Office notified when a SumUp payment lands

The SumUp webhook writes the job, a customer activity entry and a message log entry — but never a notification, so the bell stays silent.

- Add a notification write to the webhook, using the existing `notifications` feed and the same office/admin recipient rule the quote-accepted path already uses.
- Body reads like the existing payment entries: job reference, customer, amount, and whether it was a deposit or full payment.
- Placed at the single shared choke point, so both the standard checkout flow and the Make-created checkouts raise it.
- No new table, no new bell UI — it appears in the existing drawer and toast.

## 3. Deposit shown on the quote Activity timeline

The quote detail Activity list is Created / Sent / Viewed / Accepted, read from fixed date columns on the quote. The deposit lives on the converted job, so it never appears.

- Add a "Deposit Paid" step after Accepted, read from the linked job (`converted_job_id`), showing the amount and the payment date.
- Greyed out like the other steps when no payment has been taken.

## Technical notes

- `supabase/functions/_shared/sumupWebhook.ts` — partial patch gains `paid_at`; `alreadyPaid` narrows to `payment_status === "paid"`; new optional `notifyOffice` dep invoked after a successful `updateJob`.
- `supabase/functions/sumup-payment-webhook/index.ts` — implements `notifyOffice`: resolves office/admin `profiles` for the job's `organisation_id` and inserts `notifications` rows (`notification_type: "payment_collected"`, `job_id` set).
- `src/components/sales-ledger/OutstandingBalances.tsx` — the `.or("invoiced_at.not.is.null,payment_method.eq.invoice")` filter widens to also admit `deposit_paid.eq.true`; unchanged: `payment_status != 'paid'`, status not Cancelled.
- `src/pages/QuoteDetail.tsx` — fetch `service_calls(deposit_amount, deposit_paid, payment_status, paid_at)` via `converted_job_id` and append the timeline row.
- Data fix: stamp `paid_at` on `service_calls` KN-465 to its payment time. No other rows touched.
- No schema change and no RLS change.

## Testing (payments path — full TDD)

- Extend `supabase/functions/_shared/sumupWebhook.test.ts`: partial payment stamps a date; a second, balance-clearing payment on that same job still processes to `paid`; a repeat of the same partial webhook is still ignored; notification is raised once per successful payment and never on a skipped/duplicate delivery.
- Unit test the Outstanding Balances inclusion rule against a deposit-paid, never-invoiced job and confirm a fully paid job stays excluded.
- Manual check: Finance → Sales shows KN-465 with €246 taken and €246 outstanding; the bell shows a payment entry; Q-2026-0115 shows Deposit Paid.
