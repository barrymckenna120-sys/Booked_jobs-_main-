# Parts Request Notifications (DB triggers only)

Two notification paths on `parts_requests`, implemented as one new trigger function, in a single migration. No table structure changes, no frontend changes.

## Column name mapping

The request names four fields that don't exist under those names on the table. Confirmed actual columns:

| Requested        | Actual column      |
| ---------------- | ------------------ |
| part_description | `description`      |
| job_id           | `service_call_id`  |
| note             | `notes`            |
| customer_name    | `customer_name` (exists) |

`notifications.job_id` is an FK to `service_calls(id)`, so `service_call_id` populates it directly.

## Path A — cancellation fan-out to office

Fires on UPDATE when `status` changes to `'Cancelled'`.

Recipients: every active admin/office/owner in the row's organisation, using the **exact same recipient query as `notify_on_job_change()`** — that trigger reads `public.engineers` (`role IN ('admin','office','owner') AND status = 'active' AND auth_user_id IS NOT NULL`), not `profiles`. It also skips `auth.uid()` so the actor isn't notified of their own action; the same skip is kept here.

- `notification_type`: `parts_cancelled`
- `title`: `Part Request Cancelled — <customer_name>`
- `body`: `<description> (qty N) cancelled by <actor name>.`
- `role`: `office`, `job_id`: `service_call_id`, `organisation_id`: row's org
- `metadata`: `part_request_id`, `description`, `qty`, `customer_name`, `service_call_id`, `cancelled_by`, `cancelled_by_name`

"Who cancelled it": resolved from `auth.uid()` first (the frontend isn't being touched, so `cancelled_by` may stay NULL), falling back to the row's `cancelled_by`. Name resolved via `engineers.name` for that auth id, then `profiles.display_name`, else `'Unknown'`.

## Path B — office edit notifies the engineer

Fires on UPDATE when `notes` or `status` changed, the actor's role is admin/office/owner (via the existing `get_user_role(auth.uid())` helper), and the row has an engineer to address.

Recipient: a single user — `engineer_id`, falling back to `assigned_engineer_id`. Both are `uuid` FKs to `profiles(user_id)`, i.e. the same value `auth.uid()` returns, so they are used as `recipient_user_id` directly with no lookup.

- `notification_type`: `parts_updated`
- `title`: `Part Request Updated — <customer_name>`
- `body`: status change → `Status: <old> → <new>`; notes-only change → `Office added a note.`; both → combined
- `role`: `engineer`, `job_id`: `service_call_id`
- `metadata`: `part_request_id`, `description`, `old_status`, `new_status`, `notes_changed`, `updated_by`, `updated_by_name`

Suppressed when the recipient is the actor (engineer editing their own row), and when a status change to `'Cancelled'` was made by the engineer themselves.

Two points worth stating plainly:

- A cancellation performed by office staff satisfies both paths, so it sends the office fan-out **and** an engineer notification. That is intended — the engineer needs to know their request was killed.
- All 9 existing rows have `engineer_id` and `assigned_engineer_id` NULL (they predate those columns and use the legacy `assigned_to`, which is an `engineers.id`, not an auth id). Path B will therefore be a no-op on existing rows until the frontend starts writing `engineer_id`. Path A works on them today. No backfill is included, since that would be a data change beyond this prompt.

## Verification (run after the migration, output shown, not summarised)

1. Insert a temp `parts_requests` row in K&N's org with `engineer_id` set to a real profile user id and `status = 'Open'`.
2. `UPDATE ... SET notes = '<test>'` as an office actor → expect exactly 1 `parts_updated` row for that engineer.
3. `UPDATE ... SET status = 'Cancelled'` → expect one `parts_cancelled` row per active admin/office/owner in the org, plus 1 `parts_updated` for the engineer.
4. Count active admin/office/owner recipients separately and confirm the fan-out row count matches it exactly.
5. `SELECT recipient_user_id, notification_type, title, body, metadata` for the created notifications and show the raw rows.
6. Delete the temp row and every notification created by the test, then re-confirm the `notifications` count returns to its pre-test value.

Because triggers read `auth.uid()`, the test drives the updates through the authenticated PostgREST API with a real JWT (the same harness used for the earlier RLS proof), not bare psql where `auth.uid()` is NULL.

## Technical notes

- One new `SECURITY DEFINER` function `public.notify_on_parts_request_change()` with `SET search_path = public`, plus one `AFTER UPDATE` trigger on `parts_requests`. Existing triggers on the table are left alone.
- Inserts into `notifications` from a definer function bypass that table's insert policy, matching how `notify_on_job_change()` already writes.
- Wrapped so a notification failure cannot roll back the parts update.
