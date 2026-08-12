# F2 follow-up: fix Bucket C breakages and Bucket B stragglers

## Branch check — blocked

Active branch is `edit/edt-91380bb1-db5d-4eb6-89a8-47f2953ce198`, **not `dev`**. Per your instruction, migration execution is stopped here.

## What this will do once on `dev`

Apply the four statements exactly as written in a single migration file:

- `GRANT EXECUTE ON FUNCTION public.next_org_invoice_number(uuid) TO authenticated;`
- `GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;`
- `REVOKE EXECUTE ON FUNCTION public.get_my_org_id() FROM anon;`
- `REVOKE EXECUTE ON FUNCTION public.get_quote_by_number(text) FROM anon;`

No function bodies modified. No statements added, removed, or reordered. No other functions touched.

After applying, run this verification query and return the raw output for these four functions only:

```sql
SELECT proname, proacl
FROM pg_proc
WHERE proname IN ('next_org_invoice_number','get_user_role','get_my_org_id','get_quote_by_number');
```

No other tests or changes.

## Current blocker

Switch to `dev` before approving. I will not apply the migration while the active branch is not `dev`.
