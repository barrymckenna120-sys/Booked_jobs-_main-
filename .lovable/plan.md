# Line-item cost price, margin and gross profit on the quote builder

Scope: `src/components/quotes/QuoteForm.tsx` only. No migration — `quote_line_items.cost_price` (numeric, nullable) already exists.

## What changes

Office/admin users get internal profitability data on the quote builder: a Cost Price field per line, live Margin % / GP € per line, and a Total Cost / Gross Profit / Margin % block in the Pricing Summary. Engineers see the form exactly as it is today. None of the computed values are stored — only `cost_price` is saved per line.

## Role gate

`useUserRole(user)` with the existing `user` from `useAuth()`; everything cost-related renders behind `canAccessOffice`.

## Technical detail

- `LineItem` type (line 24) gains `cost_price: string` (`""` = not set). Seeded `""` in the initial state (line 49) and `addLineItem` (line 158).
- Existing quote load (line 114 map) adds `cost_price: String(i.cost_price ?? "")`.
- `selectProduct` (line 167) snapshots `cost_price: product.cost_price == null ? "" : String(product.cost_price)`. Copy-by-value; the products query already uses `select("*")`. Manual edits afterwards override the snapshot and are what gets saved.
- Per-line UI: `Cost Price €` numeric Input added to the existing row group (grid at line 393, column template widened). Below it a read-only line:
  - GP € = `(unit_price - cost_price) * qty`
  - Margin % = `(unit_price - cost_price) / unit_price * 100`, 1 decimal
  - "—" for both when cost_price is blank; "—" for Margin % when unit_price is 0.
- Pricing Summary: new block inserted after the Subtotal row (line 424) and before the VAT row — Total Cost (sum of `cost_price * qty` for lines with a cost price), Gross Profit (`afterDiscount - totalCost`), Margin % (`grossProfit / afterDiscount * 100`). "—" for all three when the summed cost is 0, and "—" for Margin % when `afterDiscount` is 0. Always rendered for office/admin, never conditionally hidden.
- Save: `itemsPayload` (line 236) gains `cost_price: li.cost_price === "" ? null : parseFloat(li.cost_price)`. Blank stays NULL, never 0. Delete-then-reinsert structure unchanged.

## Untouched

Customer, Job Type, Job Description, Description/Qty/Unit Price/Total columns, VAT rate control, Discount, Deposit auto-calc, Balance Due, Terms, Expiry, Notes, Save Draft, Send & WhatsApp, and the customer-facing quote view (no cost data exposed there).

## Verification

- Engineer login: form identical to today, no cost fields.
- Product with a cost price selected: cost snapshot populates, margin/GP appear.
- Blank cost price saves as NULL; reopening the quote shows the field blank and "—".
- Existing quote with no cost data: totals unchanged, summary block shows "—".
