# Quotes list: margin column, extra status tabs, summary bar

Scope: `src/pages/QuotesList.tsx` only.

## Blocker to confirm first

`cost_price` does not exist yet on `quote_line_items` (or `products`) — a database check
confirms no such column in the database today. Margin %, GP €, Gross Profit and Average
Margin all depend on it, so either:

- the earlier `cost_price` migration gets applied first (one migration, no code change), or
- this build ships tabs + Grand Total + Won/Lost now, and margin values render "—" until the
  column exists.

Everything below assumes the column is present.

## 1. Role gate

Reuse the existing pattern already used elsewhere:

```
const { user } = useAuth();          // already in the file
const { canAccessOffice } = useUserRole(user);
```

Margin column and summary bar render only when `canAccessOffice` is true. Engineers see the
list exactly as today (same columns, same tabs, no summary bar).

## 2. Status tabs

Add `Converted` and `Rejected` after the existing tabs:

`All, Draft, Sent, Viewed, Accepted, Expired, Converted, Rejected`

Counting and filtering switch to a `lower(status)` comparison so mixed casing
(`Sent`/`sent`, `Rejected`/`rejected`) is handled — the current exact-string arrays are
replaced by a single lowercase map. "All" and search behaviour unchanged.

## 3. Margin % column

New column between Total and Status, office/admin only.

Line-item totals are aggregated in one query (not a per-row frontend loop): a single
`quote_line_items` fetch scoped to the visible quote ids, reduced into a per-quote map of
`{ saleWithCost, cost, saleAll }`.

Per quote:

```
margin = (sum(unit_price*qty) - sum(cost_price*qty)) / sum(unit_price*qty) * 100
```

- Line items with NULL `cost_price` are excluded from both sums (never treated as 0).
- If every line item on a quote has NULL `cost_price`, the cell shows "—" for both margin
  and the GP € beneath it.

## 4. Summary bar

Above the table, office/admin only, recomputed from the currently filtered set (tab +
search):

1. **Gross Profit €** — `sum(unit_price*qty - cost_price*qty)` over line items with non-NULL
   `cost_price`.
2. **Average Margin %** — weighted `sum(profit)/sum(sale)*100`, but only across quotes whose
   `lower(status)` is `accepted`, `converted` or `rejected`. Draft/Sent/Viewed/Pending
   Approval are excluded even when visible. "—" when no closed quotes are in scope.
3. **Won / Lost** — Won = `accepted`+`converted`, Lost = `rejected`; win rate =
   `won/(won+lost)`, "—" when the denominator is 0.
4. **Grand Total** — `sum(total_amount)` across the full filtered set, all statuses.

Rendered as a four-cell card row, monospaced numerals, consistent with existing design
tokens.

## Untouched

Search bar, PDF icon/link, Date column, row navigation, failed-send warning tooltip, status
badge styling, and the existing Draft/Sent/Viewed/Accepted/Expired filter behaviour.
