# Cost Price, Margin % and GP € on the Products tab

Scope: `public.products` schema + `src/pages/Products.tsx` only. Category Select, Categories tab, and the `categories` table are untouched.

## 1. Database

One migration, nothing else:

```sql
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cost_price numeric NULL;
```

No default, no backfill, no other column changes. Existing rows stay `NULL`.

## 2. Role gating

Reuse the existing pattern already used elsewhere:

- `const { user } = useAuth();`
- `const { canAccessOffice } = useUserRole(user);`

Everything cost-related renders only when `canAccessOffice` is true. Engineers see the Products tab exactly as it is today.

## 3. Add/Edit dialog

Single addition below the existing Unit Price field, shown only for office/admin:

- Label: `Cost Price €`, numeric `Input`, optional.
- Form state gains `cost_price: string` (empty string = not set).
- On save, payload adds `cost_price: form.cost_price === "" ? null : parseFloat(form.cost_price)`.
- Blank stays `NULL` — never coerced to 0. No other dialog field is changed.

## 4. Table columns

Two new columns, office/admin only, inserted after the existing Price column:

| Column | Formula | When `cost_price` is NULL |
| --- | --- | --- |
| Margin % | `(unit_price - cost_price) / unit_price * 100`, 1 decimal | `—` |
| GP € | `unit_price - cost_price`, 2 decimals | `—` |

Both computed client-side from the already-fetched row — no extra query. Also guard `unit_price = 0` for Margin % (show `—`) to avoid divide-by-zero. Headers hidden on the same condition as the cells so the table stays aligned.

## 5. Technical notes

- `Product` type gains `cost_price: number | null`.
- Existing `select("*")` already picks the new column up once the migration runs, so the query is unchanged.
- Filtering, search, show-inactive, soft delete, and the Categories tab are all left as-is.

## Verification

- Office user: Cost Price input saves, Margin %/GP € populate; clearing it returns both to `—`.
- Engineer user: no Cost Price field, no Margin %/GP € columns.
- Product with no cost price: both columns show `—`.
