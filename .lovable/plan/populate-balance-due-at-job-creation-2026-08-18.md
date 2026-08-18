# Populate balance_due at job creation

Right now a new job only gets `balance_due` when a deposit is requested, or when it comes via quote acceptance. Every other creation path leaves it null even when the job has a price, so 362 live jobs (326 K&N, 36 Dublin Gas) have no balance recorded — 185 of them with a real price on them.

## What changes for users

- A brand-new job with a price and nothing collected yet shows the full price as its outstanding balance instead of blank.
- A job created with a deposit already paid shows the remaining balance (price minus the deposit taken).
- No change to jobs where nothing has been priced yet (balance stays blank).
- Nothing about receipts, payment collection, the SumUp flow, or the Outstanding Balances list changes in this step.

## Technical detail

### 1. `supabase/functions/_shared/paymentUpdate.ts` — `booking_setup` branch

Confirmed current state: `booking_setup` has no create-vs-edit notion, because its only caller (`src/components/jobs/NewJobPanel.tsx:1510`) is inside an `insert`, and no edit path in the app writes `revenue` at all. So today there is no job with payment history flowing through this branch.

To keep it that way, the branch takes an explicit `collectedToDate` and subtracts *that*, never `deposit_amount`:

```
/** Money already collected on this job. 0 for a new booking. */
collectedToDate?: number | null;
```

```
case "booking_setup": {
  const mode = input.depositMode ?? "none";
  const total = isSet(input.amount) && amount !== 0 ? amount : null;
  const dep = mode === "deposit" ? (input.depositAmount || null) : null;
  const collected = num(input.collectedToDate);   // 0 on create
  patch.revenue = total;
  patch.deposit_paid = mode === "paid";
  patch.deposit_required = mode === "deposit";
  patch.deposit_amount = dep;
  // balance = revenue - money actually collected to date
  patch.balance_due =
    mode === "paid"
      ? null                                    // settled upfront, nothing outstanding
      : total == null
        ? null                                  // unpriced job
        : mode === "deposit" && !isSet(input.collectedToDate) && isSet(input.balanceDue)
          ? input.balanceDue                    // caller-computed figure (NewJobPanel today)
          : round2(Math.max(0, total - collected));
  return patch;
}
```

Two notes on the contract, documented in the module comment:
- `collectedToDate` is the only permitted subtrahend. A requested-but-unpaid deposit does not reduce the balance, which matches the "Deposit Taken only requests a deposit" rule already in `NewJobPanel`.
- Any future edit call must pass `collectedToDate`; when it is supplied it wins over `balanceDue`, so an edit can never re-derive the balance from `deposit_amount`.

### 2. Tests — `src/lib/__tests__/paymentUpdate.test.ts`

Update the existing `booking_setup` cases and add:
- non-deposit priced job, no prior payments → `balance_due` equals revenue (this flips the current assertion of null)
- paid-upfront job → `balance_due` null
- deposit mode with explicit `balanceDue` and no `collectedToDate` → unchanged
- deposit requested but nothing collected (`collectedToDate: 0`) → full total outstanding, deposit_amount ignored
- edit-shaped call: revenue raised to 1000 with `collectedToDate: 400` → `balance_due` 600, and the same input with `depositAmount: 100` still gives 600
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
