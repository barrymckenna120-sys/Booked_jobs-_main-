# Quotes list: margin column, extra status tabs, summary bar

Single file: `src/pages/QuotesList.tsx`. No other changes.

## Role gate

Add `useUserRole(user)` alongside the existing `useAuth()` call. `canAccessOffice` gates the
Margin column and the summary bar. Engineers see exactly today's table and tabs.

## Status tabs

Tabs become: All, Draft, Sent, Viewed, Accepted, Expired, Converted, Rejected.

Replace the per-filter exact-string arrays with one lowercase map, so filtering and tab
counts both compare `String(q.status).toLowerCase()`. Mixed casing (`Sent`/`sent`,
`Rejected`/`rejected`) resolves to the same tab. "All" and the search box behave as today.

## Margin % column

New column between Total and Status, office/admin only.

One additional query fetches `quote_line_items` (`quote_id, qty, unit_price, cost_price`)
for the loaded quote ids, reduced once into a per-quote map of
`{ saleWithCost, cost, saleAll }`. No per-row queries.

Per quote, over line items with non-NULL `cost_price` only:

```text
margin % = (saleWithCost - cost) / saleWithCost * 100
GP €     = saleWithCost - cost
```

Cell shows "—" for both margin and the GP € beneath it when a quote has no line item with a
cost price (or when `saleWithCost` is 0). NULL cost is never treated as 0.

## Summary bar

Four-cell card row above the table, office/admin only, recomputed from the currently
filtered set (tab + search), monospaced numerals using existing tokens:

1. **Gross Profit €** — sum of `saleWithCost - cost` across the filtered quotes.
2. **Average Margin %** — weighted `sum(profit)/sum(sale)*100`, restricted to quotes whose
   lowercased status is `accepted`, `converted` or `rejected`. "—" when none in scope.
3. **Won / Lost** — Won = accepted + converted, Lost = rejected; win rate =
   won/(won+lost), "—" when the denominator is 0.
4. **Grand Total** — sum of `total_amount` across the whole filtered set, all statuses.

## Untouched

Search bar, PDF link, Date column, row navigation, failed-send warning tooltip, status badge
styling, and the existing Draft/Sent/Viewed/Accepted/Expired filter behaviour.

## Verification

- Engineer: no Margin column, no summary bar, otherwise identical.
- Office: summary bar on "All"; switching to "Sent" changes Grand Total while Average Margin
  and Won/Lost stay scoped to closed quotes.
- A lowercase `sent` quote appears under "Sent" and counts in that tab's badge.
- Quote whose line items all have NULL cost shows "—", not 0% or 100%.
