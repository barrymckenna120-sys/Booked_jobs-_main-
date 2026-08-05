# Add `cost_price` column to `public.products`

## What
Add a single nullable numeric column `cost_price` to the `public.products` table.
No default value, no backfill of existing rows, and no changes to `category`, `name`, or any other columns.

## How
1. Run a migration with the following SQL:

```sql
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cost_price numeric NULL;
```

2. Verify the result by describing the table:

```sql
\d public.products
```

## Expected outcome
- `cost_price` appears in the `public.products` table definition.
- All existing rows keep `cost_price = NULL`.
- No other columns are modified.
