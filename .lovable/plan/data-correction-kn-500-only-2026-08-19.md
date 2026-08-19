# Data correction — KN-500 only

One row, no code. Separate from BJ-B4g.

## Current row (read just now)

```text
id               ca238d96-debf-46b5-b30f-a3dba7c1d0aa
job_reference    KN-500        organisation_id  8c37827f… (K&N)
status           Completed     payment_method   card
revenue          1383.75       deposit_amount   1383.75
balance_due      1383.75       payment_status   partial
deposit_paid     true          receipt_number   KN-2026-6736
paid_at          2026-08-19 13:21:42+00
completed_at     2026-08-19 13:21:42+00
invoiced_at      (null)
```

`KN-500` matches exactly one row, so the reference is a safe key.

## The change

A single `UPDATE` on `public.service_calls`, scoped by primary key and guarded by both the reference and the org so it cannot touch anything else:

```sql
update public.service_calls
set revenue        = 2767.50,
    deposit_amount = 1383.75,
    balance_due    = 0.00,
    payment_status = 'paid',
    deposit_paid   = true
where id = 'ca238d96-debf-46b5-b30f-a3dba7c1d0aa'
  and job_reference = 'KN-500'
  and organisation_id = '8c37827f-ce2c-4507-a821-a5e807d89856';
```

| Field | From | To |
|---|---|---|
| revenue | 1383.75 | 2767.50 |
| deposit_amount | 1383.75 | 1383.75 (unchanged) |
| balance_due | 1383.75 | 0.00 |
| payment_status | partial | paid |
| deposit_paid | true | true (unchanged) |

Untouched: `status`, `paid_at`, `completed_at`, `receipt_number`, the customer record, the quote row, and every other job — including KN-498, KN-192, KN-495 and KN-497 from the sweep.

Note: the existing receipt `KN-2026-6736` was generated from the clobbered figures, so its stored PDF may still show €1,383.75 as the job total. Regenerating it is not part of this correction — say the word if you want it refreshed afterwards.

## Verification after the write

1. Re-read the full row and show it.
2. Confirm the clobber-signature sweep no longer returns KN-500 (expect KN-192, KN-495, KN-497, KN-498 remaining).
3. Confirm row counts elsewhere are unchanged (`payment_status` breakdown before/after).
4. Browser check on the live preview: KN-500 absent from Outstanding Balances (the query excludes `payment_status = 'paid'`), and Sales Ledger showing "Paid" with €2,767.50 — screenshots for both.

## Technical note

Row updates go through the insert/update tool rather than a schema migration. The `notify_on_job_change` trigger on `service_calls` will fire for this update, as it does for any edit — expected and harmless.
