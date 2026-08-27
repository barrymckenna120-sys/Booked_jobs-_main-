# Prove parts_requests RLS at the database level

Items 1 and 5 are already answered with live query output. This plan covers items 2, 3 and 4, which need real UPDATE attempts made as a real engineer and a real office user — mutations, so they need approval before running.

## What gets proven

Three assertions, each with raw output showing the database's own response:

1. Engineer → own **Open** row → `status = 'Ordered'` must be **rejected** (this is exactly what the `WITH CHECK` addition was for).
2. Engineer → a row that is **not Open** (an `Ordered` row) → any update must be **rejected** (blocked by the `USING` clause).
3. Office/admin → move a row created by someone else through **Open → Ordered → Ready to Fit → Cancelled → Open** — all must **succeed**.

Also included, since they are the flip side of assertion 1: engineer → own Open row → `status = 'Cancelled'` must **succeed**, and engineer → own Open row → `notes` edit keeping `status = 'Open'` must **succeed**. Without these, a passing test could just mean "engineers can't update anything".

## Test accounts (already confirmed to exist)

- Engineer: `Karl`, engineers.id `55b9ba7b-…`, auth user `57ebf8de-…`, org `8c37827f-…`
- Office/admin: `nicole`, user `574c0743-…`, same org `8c37827f-…`

Both are in the K&N org, so `get_my_org_id()` resolves for each and the two roles meet on the same rows.

## How the calls are made

Via the PostgREST Data API with a real signed-in JWT for each account — not psql, and not the UI. That is the only path that evaluates `auth.uid()`, `get_engineer_id()` and `get_user_role()` the way the app does. A script under `/tmp/` signs in each account, issues raw `PATCH` requests against `/rest/v1/parts_requests`, and prints the HTTP status and full response body for every attempt.

Expected shapes: rejections come back as `403` with a `new row violates row-level security policy` / `42501` body, or as `200` with an empty array when the `USING` clause filters the row out before the update. Both are recorded verbatim — an empty-array response is reported as "no row matched, update did not apply", not as a pass or a failure without explanation.

## Test data

Two throwaway rows are created in the K&N org for this, on an existing job:

- Row A — `status = 'Open'`, `assigned_to` = Karl's engineer id (his own row, used for assertions 1 and the two positive controls)
- Row B — `status = 'Ordered'`, `assigned_to` = Karl (used for assertion 2, then reused for the office walk in assertion 3)

Both rows are deleted at the end, and the run finishes by re-querying `parts_requests` to show the 9 backfilled rows are still exactly as they were — the test must not leave anything behind or disturb real data. The job's own `service_calls.status` is captured before and after so any trigger side effect from the temporary rows is visible rather than silent.

## Deliverable

Raw output for each of the five attempts: the request made, the account it was made as, the HTTP status, and the response body — followed by the final state of the two test rows before deletion, and the cleanup confirmation.

If any assertion does not behave as stated above, the finding is reported as-is with the actual output and the feature is not marked done.
