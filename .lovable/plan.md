# BJ-0090c-fix — Remaining Verification Run

Verification only. No application code changes. Two items touch the database temporarily (item 3 flag toggle, item 4 bulk update) and both are reverted or are normal office behaviour on scratch data.

## Already confirmed before this plan (read-only)

- All four `service_calls` policies (SELECT / INSERT / UPDATE / DELETE) currently show `roles = {authenticated}` in `pg_policies`. Item 6 therefore looks already applied; the run will restate this with raw output and locate the migration timestamp.
- `useRetryQueue` uses `MAX_ATTEMPTS = 3` with two exhaustion branches — item 5 will report actual runtime behaviour, not just the constant.

## What will be executed, item by item

1. **Probe 1 — engineer denied on a colleague's job**
   REST PATCH as the K&N test engineer (role `engineer`, `can_access_office = false`) against a scratch job assigned to a different engineer. Report full request line and raw response body/status, plus a SQL read-back proving no field changed.

2. **Probe 5 — cross-tenant denial**
   REST PATCH as the Dublin Gas engineer against a K&N scratch job. Report raw request/response and SQL read-back.

3. **Probe 4 — `can_access_office` escalation (Cavan Gas only)**
   Set `can_access_office = true` on a Cavan test engineer row, PATCH a Cavan job not assigned to them as that engineer, expect success with raw output, then revert the flag and post a read-back of the row showing `false`.

4. **Probe 6 — bulk boiler_brand update unaffected**
   As office/admin, run the same `customer_id`-scoped `boiler_brand` update `CustomerDetail.tsx` issues. Report row count before, the exact request, the response, and row count after.

5. **Retry-queue UI check**
   Drive the real engineer app in the browser as the test engineer and force probe 1's denied update through the UI. Report literally what appears on screen (toast text, silent success, nothing), then inspect `localStorage` retry-queue state: whether the write was queued, the attempts counter across retries, whether `MAX_ATTEMPTS` stops it, and the queue entry's end state.

6. **`TO authenticated` deployment confirmation**
   Report applied yes/no, method, and timestamp from the migration record plus a live `pg_policies` read including the `roles` column. Only if a policy is still `{public}` will a migration be raised for approval.

7. **Origin of the original narrowed policy**
   Inspect the migration list and any available migration history for a matching statement and timestamp. If the records cannot distinguish "auto-applied when SQL was pasted into chat" from "deliberate separate action", that will be stated explicitly as undeterminable rather than guessed.

**Deployment status section** will be reported separately from test results: what changed in the live database, by what method, at what timestamp (expected: nothing, or item 6 only if it turns out unapplied; item 3's flag toggle listed as reverted).

**Scratch data**: KN-527 / KN-528 / KN-529 and the CA-001 note stay in place. No cleanup.

## Reporting format

Each of the seven items reported individually with pass/fail and raw, unparaphrased output (request line, HTTP status, response body, SQL read-back).
