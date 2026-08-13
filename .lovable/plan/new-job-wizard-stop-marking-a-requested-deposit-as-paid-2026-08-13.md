# New Job wizard: stop marking a requested deposit as paid

## Root cause (confirmed)

`src/components/jobs/NewJobPanel.tsx:1287` sets

```text
depositPaid = payment.status === "paid" || payment.status === "deposit"
```

and writes it to `deposit_paid` on the insert (line 1305). "Deposit Taken" only *requests* a deposit — a SumUp link is created and sent — so the flag is stamped before any money arrives. KN-474 (and KN-471/472/473) were created this way: `deposit_paid = true`, `payment_status = 'unpaid'`, `paid_at` NULL, zero `sumup_webhook_events` rows.

Neither `send-deposit-link/index.ts` nor `_shared/depositLink.ts` touches `deposit_paid` — the wizard insert is the only creation-time writer.

## Column check

`service_calls.deposit_required` already exists (`boolean NOT NULL DEFAULT false`) and is already the field the quote-acceptance path uses for exactly this meaning. No new column, no migration.

## Change (one file, write path only)

`src/components/jobs/NewJobPanel.tsx`, at the insert:

- `deposit_required: payment.status === "deposit"` — new field on the insert.
- `deposit_paid: payment.status === "paid"` — "Deposit Taken" no longer sets it. "Paid in Full" is an office-recorded payment and keeps its current behaviour, unchanged.
- `deposit_amount` and `balance_due` keep their current expressions, untouched.

Nothing else changes: no status change, no assignment/scheduling gate, no change to `send-deposit-link`, `_shared/depositLink.ts`, the webhook handler, `sumup_webhook_events`, or any existing row.

## Effect on the read surfaces (no code change needed)

With `deposit_required = true` and `deposit_paid = false`, `resolvePaymentSheetState` hits branch 1 and returns **Case D**, so:

- `JobSlotDrawer` reads "Deposit €X due" (amber) instead of "Deposit Paid".
- The engineer card pill reads "Deposit €X due".
- `PaymentSheet` / `TakePaymentModal` pre-fill the deposit amount, which is the correct in-person collection path.

## Out of scope (explicitly not done here)

- Backfilling the mis-stamped jobs (KN-471/472/473/474 and older suspects).
- The webhook's layer-2 idempotency treating `deposit_paid === true` as "already part paid", which would no-op a genuine deposit webhook on a pre-stamped job.

## Verification

- Create a K&N test job, Deposit Taken with a deposit amount, toggle on. Query the row: `deposit_paid = false`, `deposit_required = true`, `payment_link` and `sumup_checkout_id` populated, WhatsApp send logged.
- Assign and reschedule that job to prove no gate was introduced.
- Assert `resolvePaymentSheetState` on the real row values returns Case D, not Case A.
- Read the schedule drawer for the test job and confirm "Deposit €X due".
- Delete the test job, its checkout reference and message rows afterwards.
