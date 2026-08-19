# Declined Payments — three additions before shipping

Status confirmed live already:
- RLS policy `Admin/office can read payment_checkout_attempts` (SELECT, authenticated, org + role in admin/office/owner/manager) — applied.
- `sumup-payment-webhook`, `send-payment-link`, `accept-quote`, `send-deposit-link` — deployed to production.

Only `src/pages/DeclinedPayments.tsx` changes. Query base, RLS, page location (Finance → Declined tab) and component pattern stay as approved.

## 1. Payment Type column
New column after Job Ref: "Deposit" when `service_calls.deposit_required` is true, otherwise "Balance". Rendered as a plain muted label, no new badge styling.

## 2. SumUp Ref column
New column showing `checkout_id` in the existing mono/tabular style, truncated to the first 8 characters with the full value in a `title` tooltip so the table stays readable. Falls back to "—" when null.

## 3. Summary bar
Two stats above the search box, in a bordered card row:
- **Declined today** — count and euro sum of rows whose `updated_at` falls on today (Europe/Dublin).
- **Still outstanding** — count and euro sum of all declined rows whose job still owes the money.

Both sums use the same per-row amount already implemented (`deposit_amount` when a deposit is required, else `balance_due`). "Still outstanding" is decided from the job's own payment state rather than a second correlation query: a row counts when the job is not fully paid — for a deposit attempt, `deposit_paid` is false; for a balance attempt, `balance_due` is greater than zero and `payment_status` is not `paid`. This needs `payment_status` and `deposit_paid` added to the existing `service_calls` join — no new query, no new table.

**Fast-follow, not in this build:** a true "Recovered" stat (declined attempt later followed by a paid attempt on the same job) needs a second query correlating attempts per job. Noted for a later pass.

## 4. Send New Payment Link action
A small button in the Contact column of each row, next to Call and WhatsApp. It calls the existing function with exactly the pattern used in `OutstandingBalances.tsx`:

```
supabase.functions.invoke("send-payment-link", { body: { service_call_id: job.id } })
```

Success and failure both surface a toast with the same copy shape as the existing caller ("Payment link sent" / "Send failed"). While in flight the button shows a spinner and is disabled, keyed on the row id, and its click does not trigger the row's navigation to the job.

## Out of scope, deliberately not added
Retry, Mark Paid Manually, Engineer column, Decline Reason column, extra status filters.

## Verification before deploy
Typecheck, existing unit tests, and a signed-in browser pass on Finance → Declined to confirm the new columns and summary bar render and the query still returns without error. Diff shown for approval before anything is published.
