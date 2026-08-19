# Outstanding Balances: include deposit-required-but-unpaid jobs (KN-490)

Scope is the sales ledger view only: the query filter, the client filter, and the row/total labels. No receipts, webhooks, payment writes, or other reports.

## Verified current state

- **KN-490** (K&N, `Booked`): revenue 500, deposit_required true, deposit_paid false, deposit_amount 250, balance_due 250, `invoiced_at` null, `payment_method` null, `payment_status` unpaid. It is excluded today purely by the `.or()` prefilter, because it is not invoiced, not invoice-method, and no deposit has been paid.
- Broadening the filter as specified admits **28 jobs** across both tenants that are currently hidden: 27 carry the pre-fix discounted balance (`balance_due < revenue`, total 19,303.22 owed on 35,451.75 of revenue) and 1 carries a full balance (400 with a 120 deposit requested).

## 1. Query fix — `src/components/sales-ledger/OutstandingBalances.tsx` (line 61)

```diff
-      .or("invoiced_at.not.is.null,payment_method.eq.invoice,deposit_paid.eq.true")
+      // Also chase jobs where a deposit was requested and has not been paid yet.
+      .or("invoiced_at.not.is.null,payment_method.eq.invoice,deposit_paid.eq.true,and(deposit_required.eq.true,deposit_paid.eq.false)")
```

Also add `deposit_required` and `deposit_paid` to the mapped `OutstandingJob` shape (they are already selected but dropped in the `.map()`), so the row can be classified.

## 2. Client filter — `src/lib/outstandingBalances.ts`

Current function:

```ts
export function isOutstandingBalanceJob(job: OutstandingCandidate): boolean {
  if ((job.payment_status || "").toLowerCase() === "paid") return false;
  if ((job.status || "").toLowerCase() === "cancelled") return false;
  if (num(job.balance_due) <= 0) return false;

  return (
    !!job.invoiced_at ||
    (job.payment_method || "").toLowerCase() === "invoice" ||
    job.deposit_paid === true
  );
}
```

The final `return` mirrors the old query prefilter, so it would drop every newly admitted row — this must change or step 1 has no effect. Minimal change: add one clause.

```diff
   return (
     !!job.invoiced_at ||
     (job.payment_method || "").toLowerCase() === "invoice" ||
-    job.deposit_paid === true
+    job.deposit_paid === true ||
+    (job.deposit_required === true && job.deposit_paid !== true)
   );
```

`deposit_required` is added to `OutstandingCandidate`. The `balance_due > 0` guard is correct as-is and needs no change: KN-490 passes on 250, and forward-created jobs (post-KN-490 fix) pass on the full total. Existing behaviour for invoiced / invoice-method / deposit-paid rows is untouched.

## 3. Label logic

There is currently **no** "Deposit €X due" text anywhere in this view, and `outstandingBalanceAmount()` returns a number only — it has no label concept. Today every row renders:

- `Deposit Paid` column = `deposit_amount`, regardless of whether it was paid
- `Balance Due` column = `outstandingBalanceAmount(job)`
- Status badge = the literal `Balance Pending`

So an unpaid-deposit job would claim a €250 deposit was paid. Fix by classifying each row with the existing shared helper `resolvePaymentSheetState` from `src/lib/paymentSheetAmount.ts` (no new classifier):

- **Case D** (deposit required, unpaid): `Deposit Paid` cell shows `€0.00` in muted text; `Balance Due` cell shows the amount plus a small `Deposit €X due` caption; status badge reads `Deposit Pending`.
- **Case A** (deposit paid, balance remains): unchanged — `Deposit Paid` shows the deposit, `Balance Due` shows the balance, badge reads `Balance Pending`.
- Mobile cards get the same caption treatment under the amount.

## 4. Totals row

Current calculation:

```ts
acc.total   += j.revenue || 0;
acc.deposit += j.deposit_amount || 0;
acc.balance += outstandingBalanceAmount(j);
```

Two changes so the mixed set adds up honestly:

- `acc.deposit` counts a deposit only when `deposit_paid === true`, so requested-but-unpaid deposits no longer inflate the "Deposit Paid" total.
- `acc.balance` keeps summing `outstandingBalanceAmount(j)` — the real money owed — so `Total Outstanding` stays a true receivables figure across both row kinds. Unchanged for every job already listed.

`Job Total` keeps summing `revenue`.

## 5. Verification

- Re-query KN-490 and confirm it renders with Job Total €500, Deposit Paid €0.00, Balance Due €250 captioned `Deposit €250.00 due`.
- Load the ledger for both tenants via a browser check, screenshot the table, and report the before/after row count and `Total Outstanding` delta (expected +28 rows).
- Confirm a known deposit-paid/balance-due job renders exactly as before.
- Extend `src/lib/outstandingBalances.test.ts` with the KN-490 shape (deposit required, unpaid, not invoiced → included) and a regression case asserting a deposit-not-required, uninvoiced, unpaid job is still excluded.

## Note

The 27 discounted rows this exposes are the KN-490 data-correction backlog. They will now display their stored (understated) balance. No data is edited here — that stays a separate task.
