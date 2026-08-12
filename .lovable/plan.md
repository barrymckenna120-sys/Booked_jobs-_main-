# Fix "Couldn't load this job — permission denied for function get_user_organisation_id"

## What's wrong

The engineer job details page fails to load (blank screen) because a database helper function lost its permissions during the recent security lockdown.

Confirmed by querying the database:

- `public.get_user_organisation_id()` currently grants EXECUTE only to `postgres` and `service_role` — **not** to `authenticated` (logged-in app users).
- Its sibling helpers (`get_my_org_id`, `get_user_role`, `next_org_invoice_number`) were already re-granted to `authenticated` and work fine.
- Five row-level security policies still call `get_user_organisation_id()`, so any logged-in read/write against those tables throws "permission denied":
  - `service_call_tags` (SELECT / INSERT / DELETE) — this is the one the engineer job details page reads, hence the blank screen
  - `conversations` (SELECT)
  - `tenant_integrations` (ALL)

## The fix

One small migration: grant EXECUTE on `public.get_user_organisation_id()` to `authenticated`.

This is safe and does not weaken tenant isolation — the function is `SECURITY DEFINER` and returns only the *calling* user's own organisation id, exactly like the already-granted `get_my_org_id()`. Without the grant, the policies that depend on it can't evaluate at all.

```sql
GRANT EXECUTE ON FUNCTION public.get_user_organisation_id() TO authenticated;
```

## Verification

1. Re-query `pg_proc.proacl` to confirm `authenticated=X` now appears.
2. Run a read of `service_call_tags` in an authenticated context to confirm no permission error.
3. Open an engineer job details page in the preview (mobile viewport) and confirm the page renders instead of showing "Couldn't load this job".
4. Spot-check that a job tag still only resolves within the user's own organisation (no cross-tenant leakage).

## Notes

No frontend changes are needed — the app code is correct; only the database grant is missing. If the check in step 2 shows other functions in the same bucket are still missing grants, I'll report them rather than silently widening access.
