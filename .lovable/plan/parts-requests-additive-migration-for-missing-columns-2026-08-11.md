# parts_requests: additive migration for missing columns

`parts_requests` already exists with 9 live rows, 6 RLS policies and frontend wiring. Per your choice, this is a single **additive** migration: nothing existing is renamed, dropped, or re-policied. Existing column names stay (`service_call_id`, `description`, `quantity`, `notes`, lowercase priorities).

Verified current state: table has `id, service_call_id, customer_id, customer_name, customer_address, customer_phone, organisation_id, description, quantity, priority, status, notes, logged_by, logged_by_name, assigned_to, ordered_at, ready_at, cancelled_at, created_at, updated_at`. `profiles.user_id` carries a UNIQUE constraint, so it is a valid FK target.

## Columns added

| Column | Type | Notes |
| --- | --- | --- |
| `engineer_id` | uuid NULL | FK → `profiles(user_id)`. Engineer who originated the request; null for phoned-in office orders. |
| `assigned_engineer_id` | uuid NULL | FK → `profiles(user_id)`. Who office assigned it to; independent of `engineer_id`. |
| `photo_url` | text NULL | |
| `customer_eircode` | text NULL | snapshot |
| `boiler_brand_model` | text NULL | snapshot; absent on some job types |
| `cancelled_by` | uuid NULL | FK → `profiles(user_id)` |
| `created_by` | uuid NULL | FK → `profiles(user_id)`. **Nullable, no default** — the spec asks for NOT NULL, but 9 existing rows have no value and a backfill would be a data change; it stays nullable in this migration and is enforced at the write layer. |

No defaults are added to any new column. `customer_name`, `customer_address`, `customer_phone`, `notes`, `cancelled_at`, `qty`/`priority`/`status` equivalents already exist and are untouched.

## RLS

Existing 6 policies are left exactly as they are. Two policies are **added** (permissive, so they widen access only for the new engineer columns). An engineer may act on a row when they are **either the originator or the assignee** — office-created phoned-in orders have `engineer_id = NULL`, so checking only the originator column would leave the assigned engineer unable to act:

- `parts_requests_update_own_open_engineer_id` — UPDATE TO authenticated, `USING (organisation_id = get_my_org_id() AND status = 'Open' AND (engineer_id = auth.uid() OR assigned_engineer_id = auth.uid()))`, `WITH CHECK (organisation_id = get_my_org_id() AND status IN ('Open','Cancelled') AND (engineer_id = auth.uid() OR assigned_engineer_id = auth.uid()))`
- `parts_requests_delete_own_open_engineer_id` — DELETE TO authenticated, same USING clause

Both are dropped with `DROP POLICY IF EXISTS` before creation so the migration is re-runnable.

**Type confirmation (checked, not assumed):** `profiles.user_id` is `uuid` with a UNIQUE constraint and `profiles_user_id_fkey → auth.users(id)`. `engineer_id` / `assigned_engineer_id` are `uuid` FK'd to `profiles(user_id)`, so they hold the same value as `auth.uid()` and compare directly — no `get_engineer_id()` wrapper, unlike `assigned_to` which stores `engineers.id` (a different key space) and therefore still needs the helper in the original policies.

Org scoping stays server-resolved via `get_my_org_id()`; no client-supplied `organisation_id` is trusted. Existing INSERT policy already covers engineer and office inserts, and office UPDATE already covers any row at any status.

## Which columns future frontend work targets

All new frontend work — engineer request form, My Parts list, office New Order form — writes and reads **`engineer_id` / `assigned_engineer_id`** (profiles.user_id-based, added here). `assigned_to` (engineers.id) is legacy: it stays for the existing policies and current wiring but is not extended. If both remain populated by different paths, one is retired in a later cleanup once reads are switched.


## Out of scope

No Edge Function, no trigger, no frontend change. The existing `recompute_job_parts_status` trigger and the engineer/office policies are not touched.

## Verification after it runs

Direct queries, output pasted back, not self-report:

1. `information_schema.columns` for `parts_requests` — full list with `column_default` and `is_nullable`, confirming every new column has a NULL default.
2. `pg_policies` for `parts_requests` — all 8 policy names with USING / WITH CHECK clauses.
3. `pg_constraint` — the three new FKs to `profiles(user_id)`.
4. Re-count the 9 existing rows to confirm none were disturbed.
