# Payment collection: four cases, one shared helper

Make both payment surfaces aware of what has already been collected on a job (e.g. a SumUp deposit paid online), without changing behaviour for the common flat-rate job, and while preserving in-person deposit collection.

## The four cases

**Case D — deposit required, not yet paid**
- Field pre-fills with `deposit_amount`, label "Collect Deposit (€)".
- Covers quote-derived jobs where only the deposit is taken in person.

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

Order matters:

```text
1. deposit_required === true && deposit_paid !== true  -> Case D  (amount = deposit_amount)
2. deposit_paid !== true                               -> Case C  (amount = revenue, else undefined)
3. payment_status === 'paid'                            -> Case B
4. Number(balance_due) > 0                              -> Case A  (amount = balance_due)
5. otherwise                                            -> Case B  (deposit paid, nothing owing)
```

Consequences, all intentional:
- `deposit_amount = 120` with `deposit_paid` false and `deposit_required` false/null is **Case C** — nothing collected and no deposit demanded, so the full total is collected.
- `deposit_paid = true` with `balance_due` null or `0` is **Case B**, not Case A — there is no positive balance to ask for.
- `payment_status === 'paid'` wins over a stale positive `balance_due`.

## Implementation notes (technical)

- New pure helper `src/lib/paymentSheetAmount.ts` exporting `resolvePaymentSheetState(job)` returning `{ case: 'A' | 'B' | 'C' | 'D', amount, label, depositPaid, balanceDue, jobTotal, depositAmount }`. Keeping the branch logic out of the components is what makes it directly testable and shared.
- `src/components/engineer/PaymentSheet.tsx` calls the helper. For Case C it keeps its current `useEffect` settings-default lookup untouched; the helper returns no amount for Case C when `revenue` is unset, and the existing effect fills it.
- Case B renders an early-return block inside the existing `EngineerSheet` shell; `handleConfirm` also guards on Case B and returns without calling `onDone`, so even an unexpected render path cannot submit.
- No change to `useEngineerJobs.ts`, the DB, or any query. `PaymentSheet` continues to report through the same `onDone(method, amount)` contract.

## Tests (`src/lib/paymentSheetAmount.test.ts`)

- **Case C regression (explicitly required):** Boiler Service, `deposit_paid` null, `revenue = 120` → case `C`, amount `120`, label "Job Total (€)".
- Case C with no `revenue` → case `C`, no amount returned, so the settings-default effect still governs.
- Case C with `deposit_amount = 200`, `deposit_paid` false, `deposit_required` false → still case `C`, amount = full `revenue`.
- Case D: `deposit_required` true, `deposit_paid` false, `deposit_amount = 246` → case `D`, amount `246`, label "Collect Deposit (€)".
- Case A: `deposit_paid` true, `revenue = 492`, `deposit_amount = 246`, `balance_due = 246` → case `A`, amount `246`, label "Balance Due (€)".
- Case B: `deposit_paid` true, `payment_status = 'paid'` → case `B`.
- Case B: `deposit_paid` true, `balance_due = 0` (and null) → case `B`.

## Known gap left alone (flagged, not fixed)

After a Case A collection, `useEngineerJobs.ts:245-249` stamps `payment_status = 'paid'`, `balance_due = 0` and overwrites `revenue` with the amount just collected — so the €492 job total is replaced by €246 in the record. That write path is outside this scope and is not touched here; worth a separate pass if you want the job total preserved.

---

# Part 2 — TakePaymentModal shares the same helper

`TakePaymentModal` currently gates on `job.deposit_required` (line 55: `hasDeposit = !!job.deposit_required && (job.deposit_amount ?? 0) > 0`). Because the SumUp webhook path never sets `deposit_required`, a job whose deposit was paid online is read as a no-deposit job and the modal pre-fills the **full** job total — the double-charge risk. Fix by removing that local branch logic and calling the same `resolvePaymentSheetState(job)`:

- **Case D** — pre-fill the deposit amount only, preserving today's in-person deposit collection path.
- **Case A** — pre-fill the balance due (what deposit jobs already do today when the deposit is recognised).
- **Case B** — block further collection: no amount field, no confirm path, and guarded in the handler too, not only hidden.
- **Case C** — pre-fill the full job total, unchanged from today's non-deposit behaviour.

`deposit_required` stays as a column and its existing writer (the quote-acceptance function) plus every migration are untouched. It now only distinguishes Case D from Case C; it no longer decides whether a paid deposit is recognised, which is what caused SumUp deposits to be missed.

## Extra tests (beyond the six above)

- Flat-rate fully-paid shape (KN-462/460/458/455/449): `deposit_paid=true`, `deposit_amount=null`, `balance_due=0`, `payment_status='paid'` → Case B, not Case A.
- Live partial deposit (KN-465): `revenue=492`, `deposit_amount=246`, `deposit_required=true`, `deposit_paid=true`, `balance_due=246`, `payment_status='partial'` → Case A, amount 246.
- TakePaymentModal given the KN-462 shape resolves to Case B and offers no further collection.

Report back afterwards: full test output, confirmation that `deposit_required`'s writer and migrations were untouched, and confirmation both components use the single helper.
