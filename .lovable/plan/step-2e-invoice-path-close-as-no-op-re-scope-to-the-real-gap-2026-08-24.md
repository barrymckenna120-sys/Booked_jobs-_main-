# Step 2e — Invoice path: close as no-op, re-scope to the real gap

## Decision

Raising an invoice is not a payment event. `create-job-invoice` writes `payment_status: "unpaid"`, no `paid_at`, and its only `customer_activity` row is a WhatsApp-sent record. Adding a `job_payments` row at raise time would invent money that has not moved.

So **Step 2e adds no ledger row for the invoice raise.** Two real gaps found while tracing it take its place.

## Step 2e-i — Settle the invoice row when the job settles

Today nothing ever moves `invoices.status` off `unpaid` (all 15 live rows are `unpaid`, Apr-Aug 2026), even though 14 invoice-method jobs are fully paid on `service_calls`. Invoice-level reporting is wrong independently of the ledger.

- When a job with a linked `invoices` row reaches `payment_status = "paid"`, mark that invoice `paid` and stamp a paid timestamp.
- Do it in one shared place used by every settlement path rather than per-caller.
- Backfill existing rows as its own isolated, review-gated write (separate step, per the DB-write isolation rule) — not bundled with the code change.

## Step 2e-ii — `EngineerJobDetail.tsx` duplicate payment path

`src/pages/engineer/EngineerJobDetail.tsx` (~256-300) is a full copy of the pre-refactor engineer payment logic: its own invoice and cash/card `buildPaymentPatch` branches, its own `collectedSoFar = deposit_paid ? deposit_amount : 0` (the cumulative bug already fixed in `useEngineerJobs`), its own `invoiced_at` + `createJobInvoice` call, and no `job_payments` insert.

- Migrate it onto `buildEngineerPaymentPlan` so completion gating, cumulative `priorCollected` math, the ledger insert and the stale-PDF handling are identical to the job-card path.
- No new logic — reuse only. Any behaviour difference gets flagged rather than silently changed.

## Deferred, listed so the surface is known

- `ExtraWorkSheet.tsx` / `ExtraWorkPendingCard.tsx` — cash/card extra work increments revenue directly, no ledger row, no receipt.
- `NewJobPanel.tsx` `booking_setup` — a job can be booked already deposit-paid with no ledger row.
- `TakePaymentModal` invoice branch — stays untouched, but its `collectedToDate` still uses the deposit-only expression rather than `priorCollected`.

## Technical notes

- Risk: payments and invoicing — Heavy TDD, not lite review. Each write is its own review-gated step.
- Nothing in this plan touches `buildPaymentPatch`, the SumUp webhook, `PaymentSheet.tsx`, or `TakePaymentModal`'s invoice branch.
- Tests: invoice-settlement transition (paid, partial, already-paid, no linked invoice); `EngineerJobDetail` parity tests mirroring the eleven existing engineer-path tests.
