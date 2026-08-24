# Wire job_payments into the SumUp webhook

The FK constraint name is confirmed: **`job_payments_checkout_id_fkey`**
(`FOREIGN KEY (checkout_id) REFERENCES payment_checkout_attempts(checkout_id)`). The other four
foreign keys on the table are untouched.

Approve this plan and switch to build mode to apply it — the database step needs its own approval.

## Step 1 — Database (isolated migration, review-gated)

```sql
ALTER TABLE public.job_payments DROP CONSTRAINT job_payments_checkout_id_fkey;

CREATE UNIQUE INDEX idx_job_payments_sumup_checkout_unique
  ON public.job_payments (checkout_id)
  WHERE source = 'sumup_webhook';
```

Column `checkout_id` stays, plain `idx_job_payments_checkout` stays. Reason for the drop: 4 of the
15 real paid checkouts have no `payment_checkout_attempts` row (externally created / Make Scenario 5
checkouts), so the FK would reject their ledger rows. The partial unique index — not the FK — is what
protects this path.

## Step 2 — `_shared/sumupWebhook.ts`

Extend `SumUpCheckoutView` with fields the adapter already reads but discards:

```ts
paidAt?: string | null;          // transactions[0].timestamp
transactionId?: string | null;
transactionCode?: string | null;
currency?: string | null;
```

Populated in `sumup-payment-webhook/index.ts`'s `fetchCheckout` from `res.data.transactions[0]` /
`res.data.currency`. No card block, ever.

New optional dependency:

```ts
recordPayment?: (row: {
  organisationId: string | null;
  serviceCallId: string;
  customerId: string | null;
  amount: number;
  paymentType: "deposit" | "balance" | "full";
  checkoutId: string;
  paidAt: string;
  metadata: Record<string, unknown>;
}) => Promise<void>;
```

At the existing cumulative-math site, alongside `fullyPaid`:

```ts
const ledgerType = collectedToDate > 0 ? "balance" : (fullyPaid ? "full" : "deposit");
```

Called immediately after `deps.updateJob(...)` returns true, before the activity/message/notification
writes, with the payload and metadata allow-list from the prior analysis (`method: "sumup"`,
`source: "sumup_webhook"`, `recorded_by: null`, `paid_at = view.paidAt ?? now()`, metadata =
`{source, checkout_status, checkout_reference, transaction_id, transaction_code, currency,
fully_paid, collected_to_date_before, job_revenue_at_time, backfilled_checkout_id}`).

The call is wrapped so a ledger failure can never change the outcome; the dep itself never throws
out of the adapter.

## Step 3 — `sumup-payment-webhook/index.ts`

Implement `recordPayment` as a `job_payments` insert on the existing service_role client:

- On error `23505` → `console.log` (row already exists; correct end state).
- Any other error → `console.error("LEDGER_INSERT_FAILED sumup-webhook", { job_id, checkout_id,
  amount, code, message })`.
- Either way, return normally. Outcome and HTTP status stay exactly as they are today (200 `paid`) —
  the job update already succeeded and SumUp redelivery would only be deduped by layer 1.

## Step 4 — `_shared/sumupWebhook.test.ts`

Add a `payments: []` collector to the existing harness and assert:

- First €250 on a €500 job (`balance_due = 500`) → one row, `payment_type: "deposit"`.
- €250 balance after a €250 deposit (`balance_due = 250`) → one row, `"balance"`, job settles to
  `paid` / `balance_due: 0` (the 50/50-split case).
- One-shot €500 on €500 → `"full"`.
- Unpriced job (`revenue` null) → `"full"`, `revenueMode:"fill"` behaviour unchanged.
- Overpayment → row records the actual amount, job `balance_due` clamped at 0.
- `updateJob` fails → **no** ledger insert, outcome `update_failed`.
- `recordPayment` rejects with a `23505` and with a generic error → outcome still `paid`, status 200.
- `paid_at` uses the SumUp transaction timestamp when present, webhook time when absent.

Then `deno test` + `deno check` on the three touched files.

## Notes

- No changes to `buildPaymentPatch` or the `type: fullyPaid ? "full" : "balance"` argument — the
  ledger classification is separate by design.
- No backfill of historical payments in this step; that is its own review-gated data fix.
- Risk: high (money path), covered by unit tests before deploy.
