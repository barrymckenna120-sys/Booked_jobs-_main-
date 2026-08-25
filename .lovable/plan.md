# Engineer payment: record the collected amount as the job total

## Root cause (confirmed by reading the code)

`buildEngineerPaymentPlan` (`src/lib/engineerPaymentPlan.ts:97-106`) calls `buildPaymentPatch({ type: "full", amount, revenue: jobRevenue, collectedToDate })` with **no `revenueMode`**. In the shared helper's `"full"` branch (`supabase/functions/_shared/paymentUpdate.ts`), `revenue` is only ever written when `revenueMode === "fill"`, so the engineer path never writes the job total:

- Unpriced job: `revenue` stays NULL. `balance_due` becomes 0 and `payment_status` "paid", but Finance's `collectedAmount()` reads `revenue` (falling back to `deposit_amount`, also 0) — so the job shows **€0 revenue**.
- Priced job paid for a different amount (e.g. €400 stored, €250 collected): `total = 400`, `collected = 250` → `balance_due = 150`, `payment_status = "partial"` — the job keeps showing **money outstanding** even though the engineer took the agreed amount in full.

The amount the engineer types on the sheet in this situation is literally labelled "Job Total (€)" (`resolvePaymentSheetState` Case C / unpriced), so it is the job total — it should be persisted as `revenue`.

## The fix (1 file)

`src/lib/engineerPaymentPlan.ts` — in the settle branch (non-invoice), decide whether the entered amount *is* the job total, and if so use it as the total:

- Treat the amount as the job total when the shared classifier says Case C (no deposit involved) **or** the job has no total yet (`revenue <= 0`), and a positive amount was entered.
- In that case pass `revenue: amount` into `buildPaymentPatch` and add `revenue: amount` to `dbPatchAdditions`, so `balance_due` derives from the collected amount (→ 0 outstanding, `payment_status: "paid"`) and the job total is stored.
- Case A (deposit paid, engineer collects the *balance*) and Case D (deposit-only collection) are untouched: the amount there is not the job total, so `revenue` is left exactly as booked and existing behaviour is preserved.
- Invoice branch untouched (it already backfills via `revenueMode: "fill"`).

No change to `supabase/functions/_shared/paymentUpdate.ts`, so the SumUp webhook and office paths are unaffected. No schema, RLS, grants, or Edge Function changes — writes still go through the same authenticated, org-scoped `service_calls` update.

## Tests / verification

- Extend `src/lib/engineerPaymentPlan.test.ts`: unpriced job + €180 cash → `revenue: 180`, `balance_due: 0`, `payment_status: "paid"`, ledger `full`; priced €400 job + €250 collected → `revenue: 250`, `balance_due: 0`, `paid`; Case A (deposit €100 paid of €400, collecting €300 balance) → **no** `revenue` key, `balance_due: 0`; existing regression tests (onCompleteOnly no-op, empty patch, invoice) still pass.
- Run the full vitest suite plus TypeScript/build checks.
- Live check on a scratch job only (per project rules): take payment from the engineer card on an unpriced scratch job, reload, confirm `revenue`/`balance_due`/`payment_status` persist and the job no longer appears in Outstanding Balances.
