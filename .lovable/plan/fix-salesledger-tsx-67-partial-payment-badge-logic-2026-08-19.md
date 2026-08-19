# Fix SalesLedger.tsx:67 partial-payment badge logic

## Current state (audit)

File: `src/pages/SalesLedger.tsx`

All references to `paid_at` and `payment_status` inside this file:

| Line | Context | Reads `paid_at` | Reads `payment_status` |
|------|---------|-----------------|------------------------|
| 50 | `LedgerJob` type field | yes | |
| 55 | `LedgerJob` type field | | yes |
| 67 | `getPaymentBadge` (the bug) | yes | yes |
| 121 | Main Supabase `.select(...)` | yes (fetched) | yes (fetched) |
| 123-125 | Main query date filter `.or(...paid_at.gte...,paid_at.lte...)` | yes | |
| 143 | Map result: `paid_at: r.paid_at` | yes | |
| 148 | Map result: `payment_status: r.payment_status` | | yes |
| 244 | Custom export `.select(...)` | yes (fetched) | yes (fetched) |
| 246-248 | Custom export date filter `.or(...paid_at.gte...,paid_at.lte...)` | yes | |
| 257 | Custom export map: `paid_at: r.paid_at` | yes | |
| 260 | Custom export map: `payment_status: r.payment_status` | | yes |

Current badge function (lines 66-70):

```typescript
const getPaymentBadge = (row: LedgerJob): PaymentBadge => {
  if (row.payment_status === "paid" || row.paid_at) return "paid";
  if (row.deposit_paid && (row.balance_due ?? 0) > 0) return "part_paid";
  return "unpaid";
};
```

Problem: the `|| row.paid_at` clause makes any job with a deposit timestamp display as "Paid", even when `payment_status === "partial"`.

## Proposed change

Only the first condition of `getPaymentBadge` changes. Remove the `paid_at` fallback so the badge is driven exclusively by `payment_status`.

```diff
  const getPaymentBadge = (row: LedgerJob): PaymentBadge => {
-   if (row.payment_status === "paid" || row.paid_at) return "paid";
+   if (row.payment_status === "paid") return "paid";
    if (row.deposit_paid && (row.balance_due ?? 0) > 0) return "part_paid";
    return "unpaid";
  };
```

A job with `payment_status === "partial"` and an outstanding balance will now fall through to the existing `part_paid` branch and render the same "Part Paid" label/colors already used elsewhere in the Sales Ledger (`badgeConfig.part_paid`).

## Scope

- Edit only `src/pages/SalesLedger.tsx`.
- No changes to queries, mappings, CSV export, filters, or any other component.

## Verification

- TypeScript build check.
- Manual spot-check: a job with `payment_status = "partial"`, `deposit_paid = true`, and `balance_due > 0` should show the "Part Paid" badge instead of "Paid".
