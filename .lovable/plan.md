# Line-item cost price, margin and gross profit on the quote builder

Scope: one migration on `public.quote_line_items`, plus `src/components/quotes/QuoteForm.tsx`. No other file changes.

## 1. Database

```sql
ALTER TABLE public.quote_line_items
ADD COLUMN IF NOT EXISTS cost_price numeric NULL;
```

Nullable, no default, no backfill. Depends on `products.cost_price` already existing (added in the earlier Products plan).

## 2. QuoteForm.tsx changes

**Role gate**
- `const { canAccessOffice } = useUserRole(user);` using the existing `user` from `useAuth()`. Everything cost-related renders only when `canAccessOffice` is true. Engineers see today's form unchanged.

**Type + state**
- `LineItem` gains `cost_price: string` (empty string = not set).
- The initial line item and `addLineItem` seed `cost_price: ""`.
- Loading an existing quote (line 110): map `cost_price` to `String(item.cost_price ?? "")`.

**Snapshot on product select (`selectProduct`)**
- Also set `cost_price: product.cost_price == null ? "" : String(product.cost_price)`.
- Copied by value at selection time — later edits to the product do not change the saved quote line. The products query already uses `select("*")`, so no query change.
- Manually editing the field afterwards is allowed and overrides the snapshot; the override is what gets saved.

**Per-line UI (office/admin only)**
- A `Cost Price €` numeric `Input` added to the existing per-line row group, alongside Qty / Unit Price.
- Beneath it, a small read-only line showing `Margin %` and `GP €`:
  - GP € = `(unit_price - cost_price) * qty`
  - Margin % = `(unit_price - cost_price) / unit_price * 100`, 1 decimal
  - `—` for both when `cost_price` is blank, and for Margin % when `unit_price` is 0.
- Computed on render only, never persisted.

**Pricing Summary block**
- Inserted directly after the Subtotal row and before the VAT row, office/admin only:
  - `Total Cost` = sum of `cost_price * qty` for lines that have a cost price
  - `Gross Profit` = `(subtotal - discount) - total cost`
  - `Margin %` = `Gross Profit / (subtotal - discount) * 100`, `—` when that base is 0
- Shown only when at least one line has a cost price; otherwise `—` values so the block never misleads.

**Save logic**
- The delete-then-reinsert flow at lines ~206/242 is unchanged in structure; `itemsPayload` gains `cost_price: li.cost_price === "" ? null : parseFloat(li.cost_price)`. Blank stays `NULL`, never 0.

## Untouched

Customer, Job Type, Job Description, the Description/Qty/Unit Price/Total columns, Terms & Conditions, Expiry Date, Notes, Discount, VAT toggle and rate, Deposit auto-calc, Balance Due, Save Draft, Send & WhatsApp, and the product-search category grouping all stay exactly as they are. `total_amount` and every customer-facing figure are unaffected — cost data is internal only.

## Verification

- Office user picks a product with a cost price: line cost auto-fills, Margin %/GP € populate, summary Gross Profit matches `(subtotal - discount) - total cost`.
- Overriding the cost field changes the figures and is what saves; reopening the quote shows the override, not the product's current cost.
- Product with NULL cost, or a free-typed line: cost blank, both figures `—`, saved as `NULL`.
- Engineer user: no cost field, no margin figures, no summary block.
- Customer-facing quote view shows no cost data.
