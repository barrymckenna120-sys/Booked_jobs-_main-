# PaymentSheet: three payment cases, Case C untouched

Make the engineer completion payment step aware of deposits already collected (e.g. a SumUp deposit paid online), without changing behaviour for the common flat-rate job.

## The three cases

**Case A — deposit paid, balance remains**
- Field pre-fills with `balance_due`.
- Label becomes "Balance Due (€)".
- Helper text says the deposit already collected and the original job total, so the engineer can see why the figure is lower.

**Case B — already fully paid**
- No amount field. A clear "This job is fully paid" panel replaces it, with the amount already collected.
- Payment method choices and the confirm button are not shown, so no further payment can be recorded from this sheet. A close button remains.

**Case C — no deposit (unchanged)**
- Pre-fill from `job.revenue`; when revenue is not set, fall back to the settings default price for the job type exactly as today.
- Label stays "Job Total (€)", helper text stays "Pre-filled from job price or default. Edit if needed."
- The existing `useEffect` that reads `settings` stays byte-identical in behaviour. This is the majority path (Boiler Service call-outs) and must not regress.

## How a job is classified

The deciding signal is the **`deposit_paid` boolean**, never `deposit_amount`:

```text
depositPaid = job.deposit_paid === true

if (!depositPaid)                      -> Case C   (no deposit; also covers null/false)
else if (payment_status === 'paid')    -> Case B
else if (Number(balance_due) > 0)      -> Case A
else                                   -> Case B   (deposit paid, nothing left owing)
```

Consequences of this ordering, all intentional:
- A job with `deposit_amount = 120` but `deposit_paid` false/null is **Case C** — nothing has actually been collected, so the engineer collects the full total.
- A job with `deposit_paid = true` and `balance_due` null or `0` is **Case B**, not Case A — there is no positive balance to ask for.
- `payment_status === 'paid'` wins over a stale positive `balance_due`.

## Implementation notes (technical)

- New pure helper `src/lib/paymentSheetAmount.ts` exporting a `resolvePaymentSheetState(job)` that returns `{ case: 'A' | 'B' | 'C', amount, label, depositPaid, balanceDue, jobTotal }`. Keeping the branch logic out of the component is what makes it directly testable.
- `src/components/engineer/PaymentSheet.tsx` calls the helper. For Case C it keeps its current `useEffect` settings-default lookup untouched; the helper returns no amount for Case C when `revenue` is unset, and the existing effect fills it.
- Case B renders an early-return block inside the existing `EngineerSheet` shell; `handleConfirm` also guards on Case B and returns without calling `onDone`, so even an unexpected render path cannot submit.
- No change to `useEngineerJobs.ts`, `TakePaymentModal.tsx`, the DB, or any query. `PaymentSheet` continues to report through the same `onDone(method, amount)` contract.

## Tests (`src/lib/paymentSheetAmount.test.ts`)

- **Case C regression (explicitly required):** Boiler Service, `deposit_paid` null, `revenue = 120` → case `C`, amount `120`, label "Job Total (€)".
- Case C with no `revenue` → case `C`, no amount returned, so the settings-default effect still governs.
- Case C with `deposit_amount = 200` but `deposit_paid` false → still case `C`, amount = full `revenue`.
- Case A: `deposit_paid` true, `revenue = 492`, `deposit_amount = 246`, `balance_due = 246` → case `A`, amount `246`, label "Balance Due (€)".
- Case B: `deposit_paid` true, `payment_status = 'paid'` → case `B`.
- Case B: `deposit_paid` true, `balance_due = 0` (and null) → case `B`.

## Known gap left alone (flagged, not fixed)

After a Case A collection, `useEngineerJobs.ts:245-249` stamps `payment_status = 'paid'`, `balance_due = 0` and overwrites `revenue` with the amount just collected — so the €492 job total is replaced by €246 in the record. That write path is outside this scope and is not touched here; worth a separate pass if you want the job total preserved.
