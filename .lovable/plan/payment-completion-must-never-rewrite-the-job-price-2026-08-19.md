# Payment completion must never rewrite the job price

## Part A — Audit results (read-only, already run)

### A.1 Live jobs where a deposit existed and a card/cash completion settled the job

```text
job_reference | revenue   | deposit_amount | balance_due | payment_status | payment_method
KN-482        |  120      |   11           |  0          | paid           | card
KN-481        |  120      |   11           |  0          | paid           | card
KN-483        |  500      |  500           |  0          | paid           | card
KN-489        | 1000      | 1000           |  0          | paid           | card
KN-491        |  250      |  250           |  0          | paid           | card
KN-253        |  184.5    |  184.50        |  0          | paid           | card
KN-453        |  120      |  120           |  0          | paid           | card
KN-470        | 1597.149  | 1597.16        |  0          | paid           | card
KN-467        | 1230      | 1230.00        | 1230        | paid           | card
DG-415        | 1537.5    | 1537.50        |  0          | paid           | card
DG-411        |  100      | 1000.00        |  0          | paid           | cash
```

Two shapes stand out and are consistent with the clobber:
- `DG-411`: revenue 100 but deposit 1000 — the completion overwrote a 1000 job total with the amount typed on the sheet.
- `KN-467`: `payment_status = paid` while `balance_due = 1230` — proof the "paid" decision and the balance are written independently.
- `KN-470`: revenue 1597.149 vs deposit 1597.16 — an unrounded transaction amount landed in `revenue`.

No data backfill is included in this plan (separate call, as before).

### A.2 Complete call-site list for `full` / `balance` / `invoice`

| File | Line | Type | Bug present |
| --- | --- | --- | --- |
| `src/hooks/useEngineerJobs.ts` | 258 | `invoice` | writes `revenue` from confirmed amount |
| `src/hooks/useEngineerJobs.ts` | 269 | `full` | zeroes balance unconditionally, never sets `deposit_paid` |
| `src/pages/engineer/EngineerJobDetail.tsx` | 252 | `invoice` | same as above |
| `src/pages/engineer/EngineerJobDetail.tsx` | 261 | `full` | same, plus a direct `dbPatch.revenue = confirmedRevenue` at line 301 |
| `src/components/payments/TakePaymentModal.tsx` | 137 | `invoice` | writes `revenue` from the typed amount |
| `src/components/payments/TakePaymentModal.tsx` | 204 | `deposit`/`balance`/`full` | `balance`/`full` clobber `revenue`, no `deposit_paid` |
| `supabase/functions/_shared/sumupWebhook.ts` | 482 | `full`/`deposit` | out of scope; already uses `revenueMode: "fill"` |

`src/pages/EngineerApp.tsx` is **genuinely dead** for this purpose: it is not referenced from `src/App.tsx` (no route) and contains no `revenue`, `payment_status` or `deposit_paid` writes. Nothing to change there.

One conflict to flag: the webhook and the office invoice flow rely on `full`/`invoice` filling `revenue` when a job has **no** total at all (Make-created checkouts, unpriced invoice). So the plan removes the *unconditional* revenue write while keeping the explicit `revenueMode: "fill"` backfill, which never overwrites an existing total. That preserves "payment never rewrites a price" without making unpriced jobs invisible to Finance.

## Part B — Fix

### B.1 `supabase/functions/_shared/paymentUpdate.ts`

```diff
   /** Existing balance_due — fallback on partial payments, base for increments. */
   currentBalanceDue?: number | null;
 
-  /** booking_setup only. */
+  /** booking_setup only (deposit request fields). */
   depositMode?: DepositMode;
```

```diff
-  /**
-   * booking_setup only — money ACTUALLY collected on this job so far.
+  /**
+   * Money ACTUALLY collected on this job before `amount`. Used by booking_setup
+   * and by the invoice / balance / full completion branches.
```

`invoice` branch:

```diff
     case "invoice": {
-      const resolved = isSet(input.amount) ? amount : num(input.fallbackRevenue);
+      const total = isSet(input.amount) ? amount : num(input.fallbackRevenue);
+      const collected = num(input.collectedToDate);
       patch.payment_status = "unpaid";
-      patch.balance_due = resolved;
-      if (isSet(input.amount)) patch.revenue = amount;
+      patch.balance_due = round2(Math.max(0, total - collected));
+      // revenue is the booked job price — a payment path never rewrites it.
+      // Only an explicit "fill" backfills a job that has no total at all.
+      if (input.revenueMode === "fill" && num(input.revenue) <= 0 && total > 0) {
+        patch.revenue = total;
+      }
       return patch;
     }
```

`balance` / `full` branch:

```diff
     case "balance":
     case "full": {
-      patch.payment_status = "paid";
-      patch.balance_due = 0;
-      if (input.markDepositPaid) patch.deposit_paid = true;
-      if (input.revenueMode === "fill") {
-        const known = num(input.revenue);
-        if (known <= 0 && amount > 0) patch.revenue = amount;
-      } else if (isSet(input.amount)) {
-        patch.revenue = amount;
-      }
+      const known = num(input.revenue);
+      // Only "fill" may write revenue, and only when the job has no total yet.
+      if (input.revenueMode === "fill" && known <= 0 && amount > 0) {
+        patch.revenue = amount;
+      }
+      const total = known > 0 ? known : amount;
+      const collected = num(input.collectedToDate) + amount;
+      const outstanding = total > 0 ? round2(Math.max(0, total - collected)) : 0;
+      patch.balance_due = outstanding;
+      patch.payment_status = outstanding > 0 ? "partial" : "paid";
+      // A fully paid job must never carry deposit_paid = false.
+      if (outstanding <= 0 || input.markDepositPaid) patch.deposit_paid = true;
       return patch;
     }
```

Net effect: `revenue` disappears from all three branches except the explicit `fill` backfill; `balance_due` is derived from the job total minus money actually collected; and settling always flips `deposit_paid`.

### B.2 Engineer paths (`src/hooks/useEngineerJobs.ts`, `src/pages/engineer/EngineerJobDetail.tsx`)

Both get the identical change (shown once):

```diff
+  const collectedSoFar = jobForPayment?.deposit_paid ? Number(jobForPayment?.deposit_amount || 0) : 0;
+
         Object.assign(dbPatch, buildPaymentPatch({
           type: "invoice",
           amount: confirmedRevenue != null ? Number(confirmedRevenue) : undefined,
           fallbackRevenue: Number(jobForPayment?.revenue || 0),
+          revenue: Number(jobForPayment?.revenue || 0),
+          collectedToDate: collectedSoFar,
+          revenueMode: "fill",
         }));
```

```diff
-        Object.assign(dbPatch, buildPaymentPatch({ type: "full" }));
+        Object.assign(dbPatch, buildPaymentPatch({
+          type: "full",
+          amount: confirmedRevenue != null ? Number(confirmedRevenue) : undefined,
+          revenue: Number(jobForPayment?.revenue || 0),
+          collectedToDate: collectedSoFar,
+        }));
```

And in `EngineerJobDetail.tsx` the direct clobber goes:

```diff
-      // Always write confirmed revenue on completion
-      if (confirmedRevenue !== undefined && confirmedRevenue !== null) {
-        dbPatch.revenue = confirmedRevenue;
-      }
```

The receipt amount at line 385 already falls back to `confirmedRevenue`, so the printed receipt still shows the amount collected.

### B.3 `src/components/payments/TakePaymentModal.tsx`

```diff
-          ...buildPaymentPatch({ type: "invoice", amount: revenueAmt }),
+          ...buildPaymentPatch({
+            type: "invoice",
+            amount: revenueAmt,
+            revenue: Number(job.revenue || 0),
+            collectedToDate: hasDeposit && isDepositPaid ? Number((job as any).deposit_amount || 0) : 0,
+            revenueMode: "fill",
+          }),
```

```diff
         ...buildPaymentPatch({
           type: collectingDeposit ? "deposit" : hasDeposit && isDepositPaid ? "balance" : "full",
           amount: parseFloat(amount) || 0,
+          revenue: Number(job.revenue || 0),
+          collectedToDate: !collectingDeposit && hasDeposit && isDepositPaid
+            ? Number((job as any).deposit_amount || 0)
+            : 0,
         }),
```

`deposit` branch behaviour is unchanged.

## Part C — Tests (`src/lib/__tests__/paymentUpdate.test.ts`)

Added / updated cases:
- `full` on a €500 job with a €250 paid deposit and €250 collected now → `balance_due: 0`, `payment_status: "paid"`, `deposit_paid: true`, **no** `revenue` key.
- `balance` on the same shape → identical assertions.
- `full` where the collected amount is short of the total → `payment_status: "partial"` and the true remaining balance (no false "paid").
- Regression: `expect("revenue" in patch).toBe(false)` for `full`, `balance` and `invoice` with no `revenueMode`.
- `revenueMode: "fill"` on an unpriced job still backfills `revenue` (webhook + office invoice parity).
- Existing `full`/`balance`/`invoice` expectations that asserted `revenue` are updated to the new contract.

Verification: full vitest suite plus `tsgo` typecheck, then a click-through of an engineer Card completion and the office Take Payment modal.

## `payment_status = "partial"` — confirmed safe to write
`service_calls.payment_status` is plain `text` (default `'unpaid'`) with no enum and no check constraint, and `partial` already exists on 4 live rows written by the SumUp deposit branch. No migration required.

Consumers verified: Outstanding Balances (office + engineer), `PaymentSummaryCard`, `paymentSheetAmount`, `JobDetail` badge, `financeMetrics` and the paid-transition trigger all handle `partial` correctly.

Three pre-existing consumers do **not**, and are left untouched here (separate ticket):
- `get-outstanding-invoices` and `send-outstanding-invoice-reminders` filter `.eq("payment_status","unpaid")`, so part-paid jobs are never chased.
- `SalesLedger.tsx:67` badges any row with `paid_at` as "Paid" regardless of `payment_status`, so a short-collected `partial` row would show as fully paid.
- `generate-accountant-export:44` labels anything non-`paid` as unpaid while `financeMetrics` counts its collected money as revenue.

## Out of scope
`booking_setup`, Outstanding Balances, receipts, the SumUp webhook call site, terminal SumUp statuses, the three `partial`-blind consumers listed above, and any historical data backfill for the 11 rows above.

