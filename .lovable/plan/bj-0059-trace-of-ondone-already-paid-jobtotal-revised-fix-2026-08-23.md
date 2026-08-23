# BJ-0059 — Trace of `onDone("already_paid", jobTotal)` + revised fix

## Answer: yes, it reaches `buildPaymentPatch` — and it recomputes money

`EngineerJobCard.tsx` does **not** build a separate payload. Its `PaymentSheet.onDone` (`:427-437`) just forwards to `onUpdate`:

```tsx
onUpdate(job.id, {
  status: "Completed",
  ...pendingCompletionData.data,   // CompleteSheet form fields
  paymentMethod: method,           // would be "already_paid"
  revenue: confirmedAmount,        // would be jobTotal
}, { jobTagDate: pendingCompletionData.jobTagDate });
```

`onUpdate` is `updateJob` in `src/hooks/useEngineerJobs.ts`. Any truthy `paymentMethod` enters the money block at `:252-286`, and because `"already_paid" !== "invoice"` it takes the settle branch:

```ts
dbPatch.payment_method = paymentMethod;          // :253
dbPatch.paid_at = new Date().toISOString();      // :275
dbPatch.payment_collected_by = user?.id;         // :276
Object.assign(dbPatch, buildPaymentPatch({       // :278-283
  type: "full",
  amount: confirmedRevenue,      // undefined — the card sends `revenue`, not `confirmedRevenue`
  revenue: Number(job.revenue || 0),
  collectedToDate: job.deposit_paid ? Number(job.deposit_amount || 0) : 0,
}));
```

`revenue: confirmedAmount` also survives — `sanitizeServiceCallUpdatePayload` (`src/lib/serviceCallUpdate.ts:1-23`) strips `confirmedRevenue`/`paymentMethod` but **not** `revenue`, so the caller's value lands on the row directly.

### Exact object sent to supabase (already-paid completion, KN-476 shape)

`revenue = NULL`, `deposit_paid = true`, `deposit_amount = 0` → in `buildPaymentPatch` case `"full"`: `amount = 0`, `known = 0`, `total = 0`, `outstanding = 0`.

```js
{
  status: "Completed",
  notes: "Work done: …",
  follow_up_needed: false,
  follow_up_detail: null,
  customer_facing_notes: null,
  job_tags: [...],
  job_type: "Boiler Service",
  completed_at: "<now>",
  receipt_number: "<generated>",
  revenue: <jobTotal from PaymentSheet>,   // caller value, overwrites the column
  payment_method: "already_paid",          // clobbers the real method (e.g. "sumup"/"card")
  paid_at: "<now>",                        // overwrites the original payment timestamp
  payment_collected_by: "<engineer uuid>", // overwrites the real collector
  balance_due: 0,                          // recomputed
  payment_status: "paid",                  // recomputed
  deposit_paid: true                       // recomputed
}
```

So **no**, the money fields are not left untouched. On KN-476 the recomputed values happen to equal the current ones, but three audit columns get rewritten.

### The recompute is actively unsafe on other already-paid jobs

Case B is reached whenever `payment_status = 'paid'`. Take a job priced €300 with a €100 deposit paid and the €200 balance settled by the SumUp webhook (`deposit_amount` still 100):

`total = 300`, `collectedToDate = 100`, `amount = 0` → `outstanding = 200` →

```js
{ balance_due: 200, payment_status: "partial", deposit_paid: true }
```

A fully paid job would be rewritten to **partial with €200 outstanding** and reappear on Outstanding Balances / Sales Ledger. This rules out routing the already-paid completion through the payment path at all.

## Revised fix — completion-only, no payment write

1. `src/components/engineer/PaymentSheet.tsx` — add an optional `onCompleteOnly?: () => void` prop. In the Case B panel, render a primary "Complete Job" button that calls `onCompleteOnly()` (Close stays as secondary). `handleConfirm` and the amount/method form remain blocked for Case B. No `onDone`, no method string, no amount.
2. `src/components/engineer/EngineerJobCard.tsx` — pass `onCompleteOnly` on the completion `PaymentSheet`; it calls
   `onUpdate(job.id, { status: "Completed", ...pendingCompletionData.data }, { jobTagDate })` — **no** `paymentMethod`, **no** `revenue`.
3. `src/pages/engineer/EngineerJobDetail.tsx` — same wiring against its `handlePaymentDone` sibling: a completion-only branch that calls `updateJob({ status: "Completed", ...completeData })` with no `paymentMethod`/`confirmedRevenue`.

Because `paymentMethod` is absent, `updateJob` skips `:252-286` entirely: `buildPaymentPatch` is never called, and `revenue`, `balance_due`, `payment_status`, `deposit_paid`, `paid_at`, `payment_method`, `payment_collected_by` are all left exactly as they are. Only completion fields are written (`status`, `completed_at`, `notes`, `job_tags`, `job_type`, `customer_facing_notes`, receipt number).

Scope: 3 files, no shared helper change, no schema/webhook change.

## Verification
- Confirm the completion-only path still generates the receipt number and fires the completion triggers (`notify_on_job_change`, `log_job_completed_activity`) — these key off `status`/`completed_at`, not payment method.
- Live scratch job A (unpriced, settled €0-style like KN-476): complete from the "Paid — Needs Completion" row, assert `status = Completed`, `completed_at` set, and `revenue`/`balance_due`/`payment_status`/`paid_at`/`payment_method` byte-identical before and after.
- Live scratch job B (€300 total, €100 deposit paid + balance settled): same assertion — proves the €200 partial regression cannot occur.
- Then complete KN-476 through the real path and re-query the row.
