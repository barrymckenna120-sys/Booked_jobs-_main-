# KN-500 / KN-498 clobber trace — root cause found, single defect, two entry points

Read-only trace complete. BJ-B4 did close the bug in `buildPaymentPatch`, but it never fired on the path that broke these two jobs: the **engineer job card** writes `revenue` as a raw database column, bypassing the payment builder entirely.

## 1. KN-500 timeline (Aisling Power, Q-2026-0129)

| Time (UTC, 19 Aug) | What happened | revenue | deposit_amount | balance_due | payment_status |
|---|---|---|---|---|---|
| 13:14:41 | Quote accepted → job created by `respond_to_quote` | **2767.50** | 1383.75 | 1383.75 | (null) |
| 13:15:23 | SumUp deposit webhook (`CHECKOUT_STATUS_CHANGED`, checkout `d73405ba…`) | 2767.50 | 1383.75 | 1383.75 | partial |
| 13:21:42 | Engineer completed from the job card, Card | **1383.75** | 1383.75 | 1383.75 | partial |

- Quote conversion is **correct**. `respond_to_quote` inserts `revenue = quotes.total_amount` (2767.50), `deposit_amount = 1383.75`, `balance_due = 1383.75`. Verified from the function source and the quote row (`total_amount 2767.5`, `deposit 1383.75`, `vat_rate 23`, status `converted`, `converted_job_id` = KN-500).
- The deposit stage is **correct**. The webhook calls `buildPaymentPatch` with `revenueMode: "fill"`, which refuses to write revenue when a total already exists.
- The corruption happened **only at completion**, and not inside `buildPaymentPatch`.

## 2. The mechanism

`src/components/engineer/EngineerJobCard.tsx` lines 353-358 (completion) and 370-373 (standalone payment) call `onUpdate` with the key **`revenue`**:

```
onUpdate(job.id, { status: "Completed", ...data, paymentMethod: method, revenue: confirmedAmount })
```

`useEngineerJobs.updateJob` (line 220) destructures `confirmedRevenue` — not `revenue`. So:

1. `revenue` stays in `...rest`, passes the allow-list in `src/types/service-calls.ts:45`, and is written raw as `revenue = 1383.75`. The booked price is destroyed.
2. `confirmedRevenue` is `undefined`, so `buildPaymentPatch({ type: "full", amount: undefined, revenue: 2767.50, collectedToDate: 1383.75 })` records a €0 payment → `balance_due = 2767.50 − 1383.75 = 1383.75`, `payment_status = "partial"`.
3. `Object.assign` order means the raw `revenue` survives (the `full` branch never sets revenue).

That reproduces the observed row exactly: revenue 1383.75, balance 1383.75, partial, `paid_at` stamped. It also means **the €1,383.75 the engineer actually collected on site was never recorded as a payment at all**.

`src/pages/engineer/EngineerJobDetail.tsx:180` does it correctly (`confirmedRevenue: confirmedAmount`). The card path is the only offender.

## 3. KN-498 vs KN-500 — same bug, different entry point

KN-498: revenue 250, deposit_amount 250, balance_due 250, partial, `paid_at` 13:02:40, status still `Booked`.

- Same clobber, but via the **standalone** PaymentSheet (line 370) rather than the completion sheet — hence no `status: "Completed"`.
- Different-looking symptom (revenue = the collected transaction, not "the deposit") is just because a different amount was collected. One defect, two call sites in one file.

## 4. Answer on scope

Quote-to-job conversion was **not** the problem and was correctly out of BJ-B4's scope. What BJ-B4 missed is that `updateJob` accepts an arbitrary `revenue` column from callers at all — the builder can't protect a field a caller can write around it.

## 5. Proposed fix (not applied)

1. `EngineerJobCard.tsx` — both `onDone` handlers pass `confirmedRevenue: confirmedAmount` instead of `revenue: confirmedAmount`.
2. Harden the boundary so this cannot recur: strip `revenue` from the caller-supplied `rest` in `useEngineerJobs.updateJob`, `EngineerJobDetail.updateJob`, and `EngineerApp.tsx:104`, so the payment builder is the only writer of `revenue` on payment paths. Add `revenue` to the blocklist in `src/lib/serviceCallUpdate.ts` next to `confirmedRevenue`.
3. Tests: a `updateJob` regression test proving a card completion on a job with `revenue 2767.50` / deposit paid 1383.75 leaves revenue at 2767.50 and settles to `paid`, `balance_due 0`; plus a test that a raw `revenue` key in a patch is ignored.
4. Live repro on a ZZ SCRATCH quote-to-job for both K&N and Dublin Gas, completing from the **card** (not the detail page).

## 6. Data correction needed (real customer)

KN-500 is a live booking. Correct values once approved:

```
revenue = 2767.50, deposit_amount = 1383.75, balance_due = 0.00,
payment_status = 'paid', deposit_paid = true
```
(quote total 2767.50; 1383.75 deposit via SumUp + 1383.75 card on site = settled in full).

KN-498's true total cannot be recovered from the row — it needs Barry to confirm the intended job price before correcting; its 250 deposit implies a 500 total but that is an inference, not evidence. A sweep for other rows with this signature (`payment_status = 'partial'` and `revenue = deposit_amount = balance_due`) should run alongside the correction.

Nothing has been changed. Approve and I will apply the fix, then the data correction as a separate reviewed migration.
