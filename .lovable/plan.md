# BJ-B3i: Reset KN-261 stale test row

Single concern: correct the payment fields on one job row. No code, no schema, no other rows.

## Row confirmed before any write

Matched by job reference `KN-261` — it is also the only `deposit_paid` row in the database, so both identifiers point at the same single row.

```text
id                49323882-2257-4eaf-bae5-27989ffc8034
job_reference     KN-261
organisation_id   8c37827f-ce2c-4507-a821-a5e807d89856  (K&N)
customer          mike Brown  (+353892109224)
status            Booked
payment_status    deposit_paid
deposit_paid      true
deposit_amount    153.14
balance_due       153.13
payment_link      https://buy.stripe.com/test_dRm14g1bzbFu7vnbpQcQU04
revenue           306.27
```

The `payment_link` is a Stripe **test-mode** link, confirming this is scratch data from the decommissioned Stripe path. There are zero `transactions` rows linked to this job, so nothing else depends on the deposit values.

## Convention check for "no deposit"

Across the 390 rows already at `payment_status = 'unpaid'`:

- `deposit_amount` is NULL on 343, and `= 0` on none
- `balance_due` is NULL on 344, and `= 0` on exactly 1
- `deposit_paid` is `false` on all 390 (never NULL)

So the house convention for an unpaid job is **NULL amounts** and `deposit_paid = false`. The update will match that.

## The change

One `UPDATE` on `public.service_calls`, scoped by the row's primary key `id = '49323882-2257-4eaf-bae5-27989ffc8034'` and additionally guarded with `AND job_reference = 'KN-261'`, setting:

| Field            | From                     | To      |
| ---------------- | ------------------------ | ------- |
| `payment_status` | `deposit_paid`           | `unpaid`|
| `deposit_paid`   | `true`                   | `false` |
| `deposit_amount` | `153.14`                 | `NULL`  |
| `balance_due`    | `153.13`                 | `NULL`  |
| `payment_link`   | Stripe test link         | `NULL`  |

Left untouched: `revenue`, `status`, the customer record, every other row, all secrets, and the `stripe-boiler-payment-confirm` work (BJ-B3g).

Note on `revenue` (306.27): it is out of scope per the ticket, so it stays as-is. Flagging it because a `Booked`, unpaid job carrying revenue is itself scratch-looking — say the word if you want a follow-up ticket for it.

## Verification (raw output pasted back)

1. The before-values above, re-read immediately prior to the write.
2. Full payment-field re-read of the row after the write.
3. `SELECT count(*) FROM service_calls WHERE payment_status = 'deposit_paid'` — expect `0`.
4. Confirm no other row changed: total row count and the per-status counts before/after (unpaid should go 390 → 391, deposit_paid 1 → 0, everything else identical).
5. Open KN-261 in the Job Detail UI via a headless browser session and report what the payment area shows — expecting "Unpaid", no deposit pill, no payment link — with a screenshot.

## Technical detail

The write goes through a migration (the only path available for updates), containing a single `UPDATE ... WHERE id = ... AND job_reference = 'KN-261'` statement. No DDL, no policy changes, no triggers added. The existing `notify_on_job_change` trigger on `service_calls` will fire as normal for this update; that is expected and harmless for a scratch row.
