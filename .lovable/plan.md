# Populate balance_due at job creation

Right now a new job only gets `balance_due` when a deposit is requested, or when it comes via quote acceptance. Every other creation path leaves it null even when the job has a price, so 362 live jobs (326 K&N, 36 Dublin Gas) have no balance recorded — 185 of them with a real price on them.

## What changes for users

- A brand-new job with a price and nothing collected yet shows the full price as its outstanding balance instead of blank.
- A job created with a deposit already paid shows the remaining balance (price minus the deposit taken).
- No change to jobs where nothing has been priced yet (balance stays blank).
- Nothing about receipts, payment collection, the SumUp flow, or the Outstanding Balances list changes in this step.

## Technical detail

### 1. `supabase/functions/_shared/paymentUpdate.ts` — `booking_setup` branch

Single behavioural change: derive the balance from price minus money actually collected, instead of only writing it in `deposit` mode.

```
case "booking_setup": {
  const mode = input.depositMode ?? "none";
  const total = isSet(input.amount) && amount !== 0 ? amount : null;
  const dep = mode === "deposit" ? (input.depositAmount || null) : null;
  patch.revenue = total;
  patch.deposit_paid = mode === "paid";
  patch.deposit_required = mode === "deposit";
  patch.deposit_amount = dep;
  // balance = revenue - already collected (0 for a new job unless paid upfront)
  patch.balance_due =
    mode === "deposit"
      ? (input.balanceDue ?? (total != null ? round2(Math.max(0, total - num(dep))) : null))
      : mode === "paid"
        ? null            // settled upfront, nothing outstanding
        : total;          // unpaid job: full price outstanding
  return patch;
}
```

`deposit` mode keeps honouring the caller-supplied `balanceDue` (NewJobPanel already computes it) and only falls back to the derived figure when it is absent. `paid` stays null — money is already in, nothing outstanding. `none` now carries the full total.

### 2. Tests — `src/lib/__tests__/paymentUpdate.test.ts`

Update the existing `booking_setup` cases and add:
- non-deposit priced job → `balance_due` equals revenue (this is the behaviour change; the current test asserts null and gets flipped)
- paid-upfront job → `balance_due` null
- deposit mode with explicit `balanceDue` → unchanged
- deposit mode without `balanceDue` → derived as total − deposit
- unpriced job → `balance_due` null

### 3. Other creation paths that still insert no balance

Add `balance_due: quote.total_amount || null` alongside the existing `revenue` line in:
- `src/pages/Quotes.tsx` (~line 430)
- `src/components/jobs/QuotePanel.tsx` (~line 188)

Left alone deliberately: `respond_to_quote` (already correct), `tally-incoming-job`, `tally-boiler-rebook`, `BookServiceSheet` (these create unpriced jobs, so null is correct).

### Explicitly out of scope

- `OutstandingBalances.tsx` query filter and `isOutstandingBalanceJob()` (Steps 2/3)
- Any receipt, PDF, or webhook logic
- Backfill of the 362 existing null rows — separate data task, worth doing once this lands

## Verification

- Full unit suite plus a typecheck.
- Create a Dublin Gas scratch job in each mode (no deposit / deposit requested / paid upfront) and read back `revenue`, `deposit_amount`, `balance_due` via SQL.
- Confirm Outstanding Balances and the Finance figures for the existing live set are unchanged (no filter or read-site edits in this step).

The diff will be shown for review before it is applied.
