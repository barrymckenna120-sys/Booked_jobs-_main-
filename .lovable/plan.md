# BJ-0059 — Audit findings + proposed fix

## Audit answers

**1. "Mark as Complete" handler — unchanged since BJ-0057**

`src/components/engineer/CompleteSheet.tsx:275-281`

```tsx
<Button
  disabled={!workDone.trim() || (showTagDatePicker && !jobTagDate)}
  onClick={() => onDone({ workDone, parts, ... selectedTags, selectedJobType }, jobTagDate)}
>
```

BJ-0057 only added the optional `onAdvanceView` prop (`CompleteSheet.tsx:32`) and wired it into the **Cancel** button (`CompleteSheet.tsx:282-287`). `onDone`'s signature and the Complete button are untouched.

**2. Callback chain from card**

- `EngineerJobCard.tsx:378` — `onDone` stores the form data, closes CompleteSheet, opens `PaymentSheet` (`setShowCompletionPayment(true)`).
- `EngineerJobCard.tsx:422-438` — `PaymentSheet.onDone(method, confirmedAmount)` is the only thing that calls `onUpdate(job.id, { status: "Completed", ... })`.

So the `status: "Completed"` write is **gated behind PaymentSheet confirming**. `onAdvanceView` is passed as a separate prop and does not wrap or intercept `onDone`.

**3. Can `onAdvanceView` fire on the completion click?** No. It is referenced in exactly two places: the header "Next Job" button (`EngineerJobCard.tsx:143-149`, inside a `stopProp` container) and CompleteSheet's Cancel. The Complete button calls only `onDone`. No shared handler, no bubbling path.

**4. KN-476 current row** (`73c79462-0474-4e9c-91aa-c0d4f312c48d`)

| field | value |
|---|---|
| status | `In Progress` |
| payment_status | `paid` |
| balance_due | `0` |
| deposit_paid | `true` |
| revenue | `NULL` |
| completed_at | `NULL` |
| updated_at | `2026-08-23 11:58:08Z` |

No completion write landed: `status` is still `In Progress` and `completed_at` is NULL. The `updated_at` stamp matches the payment write, not a completion.

**5. Errors?** No swallowed error — no update was ever attempted. Console log buffer contains no `[updateJob]` entries for this job.

## Root cause (confirmed by code + row values)

KN-476 is fully paid (`deposit_paid = true`, `payment_status = 'paid'`, `balance_due = 0`), so `resolvePaymentSheetState` returns **Case B** (`src/lib/paymentSheetAmount.ts:71-73`). In Case B, `PaymentSheet` renders the "This job is fully paid / No further payment can be collected here" panel with a single **Close** button (`PaymentSheet.tsx:87-113`) and `handleConfirm` early-returns. There is no path to `onDone`, so `status: "Completed"` is never written.

The same dead-end exists on the tap-through route: the "Paid — Needs Completion" compact row navigates to `/engineer/job/:id` (`EngineerCompactJobRow.tsx:30`), and `EngineerJobDetail` uses the identical CompleteSheet → PaymentSheet → `handlePaymentDone` chain (`EngineerJobDetail.tsx:1136-1148`, `:181-210`).

Net: any job settled before the engineer completes it can never be completed from the engineer app. It stays in Today's Jobs forever.

## Proposed fix (single concern)

Make Case B a **completion confirmation** step instead of a dead end, in both engineer surfaces:

1. `PaymentSheet.tsx` — in the Case B panel, replace the lone "Close" button with a primary "Complete Job" action that calls `onDone("already_paid", state.jobTotal > 0 ? state.jobTotal : state.depositAmount)`, keeping "Close" as the secondary dismiss. Remove the `handleConfirm` early-return only for this new path (the amount/method form stays blocked).
2. Callers already write `status: "Completed"` on `onDone`, so no change needed in `EngineerJobCard.tsx` / `EngineerJobDetail.tsx` — but verify the `paymentMethod: "already_paid"` value flows harmlessly through `buildPaymentPatch` / `stripCallerRevenue` and does not double-count revenue or re-trigger a payment write. If `buildPaymentPatch` would treat it as a new collection, pass a flag so the patch carries completion fields only.

Scope: 1 file (plus a guard tweak in the payment patch helper only if step 2's check requires it). No schema change, no webhook change.

## Verification
- Unit test for the payment-patch path with `paymentMethod: "already_paid"` (no revenue/balance mutation).
- Live check on a scratch job: settle it fully, confirm it lands in "Paid — Needs Completion", complete it, confirm `status = Completed`, `completed_at` set, `balance_due` and `payment_status` unchanged, and the job leaves Today's Jobs.
- Then correct KN-476 through the real path.
