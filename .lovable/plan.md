# Read-only audit: function DEFINER status and frontend call sites

## Active branch

**NOT `dev`.** Current branch is:

```
edit/edt-f60c9579-f172-431d-9b96-2ab746dc75fb
```

Per your instruction, I am stopping and flagging this before proceeding further.

## Query output

Raw rows from:

```sql
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('generate_invoice_number','generate_job_reference','derive_area_code','update_updated_at_column');
```

| proname                  | prosecdef |
|--------------------------|-----------|
| derive_area_code         | false     |
| generate_invoice_number  | false     |
| generate_job_reference   | false     |
| update_updated_at_column | false     |
| update_updated_at_column | false     |

## Frontend call-site search

No function in the list has `prosecdef = true`, so no frontend search is required.

## Conclusion

None of the four functions are `SECURITY DEFINER`. Nothing needs to be folded into Bucket C from this set.
