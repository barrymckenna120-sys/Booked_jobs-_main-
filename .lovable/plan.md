# BJ-0090c-fix — Verify the narrowed service_calls UPDATE policy

## Pre-flight live read result (important)

The migration you pasted is **already live** on the database. Read from `pg_policies` just now:

- `service_calls_org_isolation` — **gone** (no longer present).
- `service_calls_update` — already the narrowed version, with the exact USING/WITH CHECK expression from your prompt (org check + elevated-role allowlist + `can_access_office` EXISTS + `assigned_engineer_id = get_engineer_id(auth.uid())`).
- `service_calls_select` (org check), `service_calls_insert` (org check in WITH CHECK), `service_calls_delete` (org check) — all still present, all `TO authenticated`, all unchanged.
- No policy on `service_calls` references `service_calls_org_isolation` by name (policy names aren't referenceable; nothing else depends on it).
- Table grants: `authenticated` has SELECT/UPDATE, `anon` has none, `service_role` has both (and bypasses RLS).

So re-applying the migration is a no-op. Remaining work is verification only.

## One small correction to propose

The live `service_calls_update` policy has `roles = {public}` — it is missing `TO authenticated`, unlike the other three policies. Practically harmless (`anon` has no table grants, `service_role` bypasses RLS), but it breaks the pattern. Single-statement fix, one migration:

```sql
DROP POLICY IF EXISTS service_calls_update ON public.service_calls;
CREATE POLICY service_calls_update ON public.service_calls
FOR UPDATE TO authenticated
USING (...same expression...) WITH CHECK (...same expression...);
```

Say the word and I include it; otherwise I skip it and only verify.

## Verification: the six probes

Each probe run as a real authenticated session (JWT-scoped, not service role), reported individually pass/fail with the exact SQL/HTTP run and the raw result:

1. K&N Engineer A (`role = 'engineer'`, `can_access_office = false`) updates a job assigned to a different K&N engineer — expect denied (0 rows / permission error).
2. Engineer A updates their own assigned job — expect success. Then Take Payment and Extra Work flows end to end through the engineer UI (Playwright, Cavan/scratch job) to confirm no regression.
3. Office/admin user updates any job in their org regardless of assignee — expect success. Then Schedule assign/move and JobDetail reassign end to end.
4. Cavan Gas only: set `can_access_office = true` on a test engineer row, update a job not assigned to them — expect success; revert the flag immediately after (revert confirmed by read-back).
5. Dublin Gas engineer updates a K&N job — expect denied (org check).
6. Office/admin runs the CustomerDetail bulk `boiler_brand` update against a customer with several jobs — expect all rows updated.

All row-writing probes run against scratch/test jobs (Cavan Gas or scratch K&N jobs), never real customer data.

## Additional check: denied write through the real UI path

Force probe 1's denied update through the engineer UI, not just SQL, and report what actually happens to the failed request. What the code does today (`src/hooks/useRetryQueue.ts`, used by `useEngineerJobs.ts` and `EngineerJobDetail.tsx`):

- On error the update is pushed into the localStorage retry queue.
- `MAX_ATTEMPTS = 3`, so it is **not** an infinite loop; after the third failure the item is dropped with a `console.error`.
- Any dependent queued row (e.g. the `job_payments` ledger insert) is dropped with it.

I'll confirm this is what actually happens live and report whether the engineer sees anything user-facing, or whether the write disappears silently. No code change to the queue in this task — if the silent drop looks wrong, I flag it as a separate ticket.

## Deployment status reporting

Reported separately from test results: whether a migration was applied in this task at all, by what method, and with a timestamp. Given the pre-flight read, the expected report is "already applied prior to this task; no new migration run" (plus the `TO authenticated` migration if you approve it).

## Out of scope

No other file, table, policy, or refactor. No changes to `useEngineerJobs.ts`, `useRetryQueue.ts`, or any UI.
