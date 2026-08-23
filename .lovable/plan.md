# BJ-0071 security correction — explicit review gate

## Confirmed current state

- The deployed `protect_parts_request_office_fields()` function is `SECURITY DEFINER` and owned by `postgres`.
- Its automated-context bypass checks `current_user IN ('service_role', 'postgres', 'supabase_admin') AND auth.uid() IS NULL`.
- Inside this security-definer function, `current_user` resolves to the function owner (`postgres`), so that clause does not independently authenticate the original caller.
- `parts_requests` has RLS enabled and every policy is restricted to `authenticated`; there is no anonymous policy. This currently blocks a null-UID anonymous client request, but the trigger should not rely on that adjacent control for its own caller classification.

## Proposed correction

1. Replace the `current_user` bypass with an explicit, reviewable system-context condition based on the original session/JWT context rather than the security-definer execution identity.
2. Preserve office-role writes and engineer status-only updates exactly as they work today.
3. Remove the unnecessary `anon` table grant so grants align with the authenticated-only policies.
4. Keep this as one isolated migration with no backfill or other data writes.

## Required pre-execution review gate

Before applying anything, send Barry:

- the complete proposed replacement function SQL;
- the exact `DROP/CREATE TRIGGER` or function replacement statements;
- an explanation of each allowed system context and why a browser client cannot produce it;
- the proposed grant change;
- the SQL verification script.

Stop and wait for Barry's explicit approval. Do not execute in the same response.

## Verification after approval

- Anonymous/null-UID request cannot insert or update a protected field.
- Authenticated engineer cannot write protected fields.
- Authenticated engineer can still perform an allowed status-only update on an owned Open request.
- Office actor can write protected fields.
- Approved service/system context can write protected fields.
- No scratch rows or persistent test data remain.

## Standing process rule

When Barry says “before executing, send X,” send X and stop. Execution requires a later, explicit approval; checks and execution must never be bundled into one response.