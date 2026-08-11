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

Existing 6 policies are left exactly as they are. Two policies are **added** (permissive, so they widen access only for the new originator column, matching the spec's "engineers can update/delete only their own Open rows"):

- `parts_requests_update_own_open_engineer_id` — UPDATE, `USING (organisation_id = get_my_org_id() AND status = 'Open' AND engineer_id = auth.uid())`, `WITH CHECK (organisation_id = get_my_org_id() AND status IN ('Open','Cancelled') AND engineer_id = auth.uid())`
- `parts_requests_delete_own_open_engineer_id` — DELETE, same USING clause

Org scoping stays server-resolved via `get_my_org_id()`; no client-supplied `organisation_id` is trusted. Existing INSERT policy already covers engineer and office inserts, and office UPDATE already covers any row at any status.

## Out of scope

No Edge Function, no trigger, no frontend change. The existing `recompute_job_parts_status` trigger and the engineer/office policies are not touched.

## Verification after it runs

Direct queries, output pasted back, not self-report:

1. `information_schema.columns` for `parts_requests` — full list with `column_default` and `is_nullable`, confirming every new column has a NULL default.
2. `pg_policies` for `parts_requests` — all 8 policy names with USING / WITH CHECK clauses.
3. `pg_constraint` — the three new FKs to `profiles(user_id)`.
4. Re-count the 9 existing rows to confirm none were disturbed.
