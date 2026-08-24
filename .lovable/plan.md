# job_payments wiring in the SumUp webhook — pre-implementation report

Read-only analysis of the four points. No implementation yet.

## 1. payment_type derivation — confirmed, no extra lookups

At the `buildPaymentPatch()` call site both inputs already exist as locals a few lines above:

```ts
const collectedToDate = revenue > 0 && job.balance_due != null
  ? Math.max(0, Math.round((revenue - Number(job.balance_due)) * 100) / 100)
  : 0;
const fullyPaid = revenue > 0 ? collectedToDate + amount + 1e-9 >= revenue : amount > 0;
```

So the ledger classification is a pure expression, zero additional reads:

```ts
const ledgerType = collectedToDate > 0 ? "balance" : (fullyPaid ? "full" : "deposit");
```

This is deliberately distinct from the `type: fullyPaid ? "full" : "balance"` passed into
`buildPaymentPatch` (that value only selects the cumulative arithmetic branch and must not
change). All three values are allowed by the `job_payments.payment_type` CHECK constraint.

Edge cases worth naming:
- Unpriced job (Make Scenario 5, `revenue` null): `collectedToDate = 0`, `fullyPaid = amount > 0`
  → `"full"`. Correct — `revenueMode:"fill"` makes that payment the whole job total.
- A stale/incorrect `balance_due` (e.g. `deposit_paid` stamped with no money behind it, the old
  New Job wizard bug) would misclassify a first payment as `"balance"`. Classification only, no
  money impact.

## 2. Partial unique index — no conflict, recommended

Current indexes on `job_payments`: `job_payments_pkey`, `idx_job_payments_service_call`,
`idx_job_payments_org`, `idx_job_payments_checkout` (plain btree on `checkout_id`).

`CREATE UNIQUE INDEX idx_job_payments_sumup_checkout_unique ON public.job_payments (checkout_id)
WHERE source = 'sumup_webhook';` coexists fine with the plain index — Postgres allows any number
of indexes on the same column, and a partial unique index only constrains rows matching its
predicate. The plain index stays useful for lookups across all sources. Nulls are also distinct in
Postgres, so non-SumUp rows with a null `checkout_id` are unaffected.

It gives exactly the DB-level guarantee asked for: one ledger row per checkout on this path,
independent of the layer-1 claim, and independent of the removed layer-2 guard (a second genuine
checkout on the same job is a different `checkout_id` and still inserts).

### Blocker found — the existing FK will reject 27% of real checkouts

`job_payments.checkout_id` has `REFERENCES public.payment_checkout_attempts(checkout_id)`.
Checked against live data:

```
sumup_webhook_events joined to payment_checkout_attempts:
  total paid checkouts seen: 15
  with no attempt row:        4
```

Those 4 are externally created checkouts (Make Scenario 5 / older deposit links) that never wrote
an attempt row — the same population the webhook's discovery + backfill path exists for. Inserting
their ledger row would raise a foreign-key violation.

Options (needs your call before implementation):
- **A. Drop the FK on `job_payments.checkout_id`**, keep the column as a plain text reference plus
  the partial unique index. Simplest; the ledger stays writable for every real payment.
- **B. Keep the FK and have the webhook upsert a `payment_checkout_attempts` row** for discovered
  checkouts before inserting. Preserves referential integrity but makes the webhook write to a
  table it currently only PATCHes, and backfills a synthetic "attempt" that never happened here.
- **C. Keep the FK and set `checkout_id = null`** when no attempt row exists, recording the id in
  `metadata` only. Keeps the schema untouched but defeats the partial unique index for exactly the
  externally created checkouts, and loses the join.

Recommendation: **A**. The unique index, not the FK, is what protects this path.

## 3. Insert payload

```ts
{
  organisation_id: job.organisation_id,      // non-null past line ~370's org check
  service_call_id: job.id,
  customer_id: job.customer_id,              // NOT NULL in DB; type-nullable only, 0 real nulls
  amount,                                    // authoritative SumUp amount (txn amount preferred)
  payment_type: ledgerType,                  // "deposit" | "balance" | "full" per #1
  method: "sumup",
  source: "sumup_webhook",
  checkout_id: checkoutId,
  reverses_payment_id: null,
  note: null,
  metadata: { ... see below },
  recorded_by: null,                         // no user; service_role write
  paid_at: paidAt,                           // see below
}
```

**`paid_at`** — prefer SumUp's own transaction timestamp, fall back to webhook-received time:
`transactions[0].timestamp ?? new Date().toISOString()`. Note this is *not* currently exposed:
`SumUpCheckoutView` carries only `ok/status/amount/checkoutReference`, and the adapter reads
`transactions[0]` but discards everything except the amount. Implementation will add
`paidAt?: string | null` (and the metadata fields below) to that interface.

Keeping the SumUp timestamp matters because Finance dates revenue from payment time; the redelivery
window is up to ~2 hours, so webhook-received time can land the money on the wrong day.

**`metadata`** — an explicit allow-list, never the raw view object. SumUp's checkout response
includes a `transactions[].card` block (`last_4_digits`, `type`); no PAN, no CVV, no expiry — SumUp
never returns those — but last-4 is customer card data with no use in this ledger, so it is excluded:

```ts
metadata: {
  source: "sumup",
  checkout_status: status,                       // "PAID"
  checkout_reference: view.checkoutReference,
  transaction_id: txn?.id ?? null,
  transaction_code: txn?.transaction_code ?? null,
  currency: view.currency ?? null,
  fully_paid: fullyPaid,
  collected_to_date_before: collectedToDate,
  job_revenue_at_time: revenue,
  backfilled_checkout_id: backfillCheckoutId,
}
```

That is safe to store (identifiers and our own derived numbers only) and is enough to reconcile a
row against SumUp's dashboard later.

## 4. Placement and failure semantics

Placement: **immediately after** the successful `deps.updateJob(...)` at line ~522 and before the
activity/message/notification writes — inside the existing `if (!ok) return "update_failed"` gate,
so a ledger row is never written for a job update that failed.

Ordering rationale: `service_calls` is what the app reads; `job_payments` is the audit ledger. If
only one can land, the job must be the one that lands.

Recommendation: **sequential writes, not an RPC transaction.** Reasons:
- The two writes cannot be made atomic without moving both into one Postgres function, which would
  pull `buildPaymentPatch`'s output through an RPC boundary and duplicate money logic in SQL — the
  opposite of the single-source-of-truth invariant this module holds.
- SumUp's redelivery is not a usable retry for this: layer 1 has already claimed the checkout, so a
  retry returns `duplicate` and never reaches the insert. A failed insert is therefore permanent
  until reconciled — which is precisely why the failure must be loud rather than retried.
- Divergence direction is bounded and detectable: job updated, ledger row missing. Step 3's
  reconciliation query (paid `service_calls` with no matching `job_payments` row for their
  `sumup_checkout_id`) finds exactly this shape.

So the insert failure handling will be:
- `console.error` with a distinctive, greppable prefix including `job_id`, `checkout_id`, `amount`
  and the PG error — e.g. `LEDGER_INSERT_FAILED sumup-webhook ...`.
- Outcome/HTTP status unchanged (still 200 `paid`) — the money *is* recorded on the job; making
  SumUp retry would only produce a `duplicate` no-op.
- A `23505` unique violation on the new partial index is logged at info, not error: it means the
  ledger row already exists, which is the correct end state.

If you would rather have the ledger be non-negotiable, the alternative is to return 500 on insert
failure — but that leaves the job already updated and the retry deduped away, so it buys nothing.

## Decisions needed before implementation

1. FK option A / B / C from section 2.
2. Confirm the metadata allow-list (excluding card last-4) rather than the raw payload.
3. Confirm sequential-writes-with-loud-logging over an RPC transaction.
