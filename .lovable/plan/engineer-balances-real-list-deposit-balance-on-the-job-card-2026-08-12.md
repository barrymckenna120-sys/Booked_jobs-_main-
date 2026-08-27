# Engineer balances: real list + deposit/balance on the job card

Two changes to the engineer app. Frontend only — no schema changes, no change to how payments are recorded.

## Pre-checks (already confirmed)

- **`send-payment-link` has no role gate.** The function is not listed in `supabase/config.toml`, so `verify_jwt` defaults to true (any signed-in user), and the handler itself contains no role, profile, or `has_role` check — it takes `service_call_id`, loads the job with the service-role key, and sends. An engineer-initiated call behaves identically to the office ledger's call. Safe to wire the button up; engineers are permitted.
- **The pill will reuse `resolvePaymentSheetState`.** No new classification helper. `src/lib/paymentSheetAmount.ts` already returns `case`, `depositAmount`, and `balanceDue`, which is everything the pill needs.

## Part 1 — Engineer Outstanding Balances: real list

`src/components/engineer/EngineerOutstandingBalances.tsx` is rewritten.

- Query selects `id, job_reference, scheduled_date, job_type, revenue, deposit_amount, deposit_paid, deposit_required, payment_method, payment_status, invoiced_at, balance_due, customers(name, phone)` as a hardcoded string. Plus `customer_id, user_id, assigned_engineer, receipt_number` — `TakePaymentModal` requires those on its `job` prop, so they are needed for the Take Payment action to work.
- **Server-side scoping.** The existing `assigned_engineer_id.eq.<engineers.id>` filter stays in the query itself, alongside `payment_status != 'paid'`, `status != 'Cancelled'`, and the same `.or("invoiced_at.not.is.null,payment_method.eq.invoice,deposit_paid.eq.true")` prefilter the office ledger uses. The engineer id comes from the `engineers` row for the logged-in `auth_user_id`, so nothing another engineer owns is ever returned over the network.
- Qualification runs through `isOutstandingBalanceJob` from `src/lib/outstandingBalances.ts` — not reimplemented. The current local rule (`deposit_paid = true` and `revenue > deposit_amount`) is dropped; balances read from `balance_due`.
- Collapsed: the existing amber summary bar (count + total), now tappable to expand instead of navigating to `/finance`.
- Expanded: one row per job — customer name, job reference, job type, scheduled date, and balance due in bold.
- Row actions: **Take Payment** opens the existing `TakePaymentModal` unchanged, so the four-case logic applies automatically; **Send Link** invokes `send-payment-link` with `{ service_call_id }`, with a per-row spinner and success/failure toast, mirroring the office ledger's handler. Tapping the row body navigates to `/engineer/job/:id`.
- Empty state: renders nothing, as today.

## Part 2 — Deposit/balance on the job card

`src/components/engineer/job-card/InfoPills.tsx` swaps its `depositPaid` boolean for a `paymentJob` prop (the job object), calls `resolvePaymentSheetState(paymentJob)`, and maps:

- Case D → warning pill, `Deposit €X due`
- Case A → success pill, `Deposit €X paid`, plus one low-emphasis line beneath the pills: `Balance due €Y`
- Case B → no pill, no balance line
- Case C → no pill, no balance line

This removes today's misleading `€0 Pending` pill on straight cash jobs. `EngineerJobCard.tsx` passes `paymentJob={job}` in place of `depositPaid`. `src/pages/engineer/EngineerJobDetail.tsx`'s Payment tile is rewired to the same `resolvePaymentSheetState` call so the card and detail view can't disagree — Case A shows deposit paid plus the balance, Case D shows the deposit due, Cases B and C omit the tile.

## Tests

- `src/lib/outstandingBalances.test.ts` extended with the KN-129 shape (positive `balance_due` while `deposit_paid` is false but the job is invoiced), a zero-balance case, and a cancelled-job exclusion.
- Pill mapping test importing `resolvePaymentSheetState` directly (adjacent to `paymentSheetAmount.test.ts`), asserting all four cases produce the intended pill visibility, tone, and balance-line visibility — no parallel implementation.
- Live check on `/engineer/today` as the test engineer: expand the list, read the rows, and compare the total against Finance → Sales Outstanding Balances filtered to the same engineer, reporting the real figures.

## Not in scope

KN-128's null `revenue`, KN-129's `deposit_paid` mismatch, and rows stamped `paid_at` while `unpaid` are left untouched. Reading `balance_due` displays them correctly without editing production data.
