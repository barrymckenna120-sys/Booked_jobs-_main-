# Parts Needed: single-part requests + narrowed job-status sync

## Confirming your two decisions

**1. One part per request — no multi-line sheet.** Every `parts_requests` row is exactly one part: one description, one quantity, one status, one priority. The engineer form and the office form submit one part at a time. Two parts on the same job means two separate submissions creating two separate rows. The "add another part" multi-line sheet built in the last pass gets removed, not kept as an option.

**2. "Parts Needed" only applies before a job has started.** The sync trigger may only move a job into `parts_needed` / `parts_ordered` / `parts_arrived` from a not-yet-started status. `In Progress`, `Completed`, and `Cancelled` are never overwritten under any circumstance. When a part is logged on an `In Progress` job, the job stays `In Progress` and the part's state lives only on its own row, surfaced through the parts badge, the Parts list, and the notification — never by rewriting the job's lifecycle status.

## Actual status values in this database

Live counts on `service_calls.status`: `Completed` 169, `archived` 97, `Booked` 74, `Pending` 48, `In Progress` 31, `Cancelled` 28, `incoming` 4, `parts_needed` 3, `parts_arrived` 3, `parts_ordered` 3, `no_show` 2, `Scheduled` 2, `On Site` 2, `En Route` 1, `completed` 1.

Not-yet-started statuses, used explicitly as the only eligible set:

- `Pending` — booked in, not yet allocated a date
- `Scheduled` and `Booked` — dated, engineer not started (`Booked` is the volume status in this app; `Scheduled` is legacy)
- `parts_needed`, `parts_ordered`, `parts_arrived` — so a job can move between parts states and back out

Everything else is excluded: `In Progress`, `On Site`, `En Route` (all mean the engineer has started), `Completed`, `completed`, `Cancelled`, `archived`, `no_show`, `incoming`, `Awaiting Deposit`.

One thing to note rather than silently change: a `Pending` job moved to `parts_needed` leaves the Incoming Jobs pipeline count while it waits on parts, because that list keys off `Pending`. That follows from your rule, so it is built as specified — flagging it so the drop is expected rather than a surprise.

## What changes

**Migration — narrow the trigger**

- Replace the eligible-status list in `recompute_job_parts_status` with `Pending`, `Scheduled`, `Booked`, `parts_needed`, `parts_ordered`, `parts_arrived`. This removes `En Route` and `On Site`, which the first version wrongly allowed.
- When the last active part on a job closes out, the job returns to a real pre-start status instead of a hardcoded `Scheduled`: `Booked` when the job has a `scheduled_date`, otherwise `Pending`.
- No table or column changes — `parts_requests` already stores one part per row.

**Engineer form — back to a single part**

- `PartsNeededSheet` returns to one description field, one priority selector, and an optional quantity. No add/remove rows, no per-line array.
- `EngineerJobCard` inserts exactly one row per confirm.

**Shared helpers**

- `insertPartsRequest` (singular) takes one part and returns the created row.
- `deriveJobStatusFromParts` mirrors the narrowed trigger exactly: eligible list, the `Booked`/`Pending` fallback, and returning "no change" for `In Progress`, `On Site`, `En Route`, `Completed`, `Cancelled`, `no_show`, `archived`, `incoming`.

**Office side (unchanged behaviour, one part per row)**

- Parts page, dashboard Parts panel, and the Job Detail parts card keep listing one card per part with its own Ordered / Ready to Fit / Cancel controls.

## Tests

- Trigger mirror: a part logged on `In Progress` leaves the job untouched; same for `On Site`, `En Route`, `Completed`, `Cancelled`, `no_show`, `archived`.
- `Pending`, `Scheduled`, and `Booked` each move to `parts_needed`.
- Closing the last part returns a dated job to `Booked` and an undated job to `Pending`.
- Single-part row building: trimming, quantity default of 1, phone-in requests with no job or customer record.
- Live check against the real trigger: log a part on an `In Progress` test job and confirm the job status does not move.

## Technical notes

- The trigger is the single source of truth for job status; the TypeScript mirror exists for tests and optimistic UI only, and both lists are edited together.
- `service_calls.parts_priority` / `parts_logged_at` stay as the denormalised summary the Jobs, Schedule, and Follow-ups badges read, written from the one submitted part.

## Point 4 — engineers table verified by query (evidence)

`information_schema.tables` (schema `public`) returns **`engineers`** and **`profiles`** — the `engineers` table is real.

`information_schema.table_constraints` + `key_column_usage` for `engineers`: `PRIMARY KEY` on **`id`** (uuid, not null). Its other identity columns are `user_id` (uuid, nullable) and `auth_user_id` (uuid, nullable) — the auth link is `auth_user_id`, not `id`.

So no fallback to `profiles(user_id)` is needed: `assigned_to` keeps its existing FK to `engineers(id)`, which the current rows already satisfy (all 9 backfilled rows carry a real `engineers.id` in `assigned_to`).

One consequence for the policy wording you gave: because `assigned_to` holds an `engineers.id`, `assigned_to = auth.uid()` can never match. The engineer-side check uses the existing security-definer helper `public.get_engineer_id(auth.uid())`, which maps the signed-in user to their `engineers.id`. `logged_by` stays an auth user id and is compared to `auth.uid()` directly. Query evidence: `logged_by` is NULL on all backfilled rows (they came from note parsing, no author), `assigned_to` matches `engineers.id`.

## Point 2 — actual RLS policy definitions

Pattern mirrored: **`public.engineers` / policy `engineers_update`** — `(organisation_id = get_my_org_id()) AND ((get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])) OR (auth_user_id = auth.uid()))`. Same org gate, same admin/office role array via `get_user_role`, same "or it's your own row" fallback. The parts policies use that shape with the extra `status = 'Open'` restriction on the engineer branch.

The four existing permissive policies on `parts_requests` (`parts_requests_select`, `_insert`, `_update`, `_delete`, all currently org-only) are dropped and replaced by:

```sql
DROP POLICY IF EXISTS parts_requests_select ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_insert ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_update ON public.parts_requests;
DROP POLICY IF EXISTS parts_requests_delete ON public.parts_requests;

-- SELECT: any authenticated user in the organisation
CREATE POLICY parts_requests_select ON public.parts_requests
FOR SELECT TO authenticated
USING (organisation_id = public.get_my_org_id());

-- INSERT: any authenticated user in the organisation
CREATE POLICY parts_requests_insert ON public.parts_requests
FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

-- (a) engineer / non-admin: own rows only, and only while still Open
CREATE POLICY parts_requests_update_own_open ON public.parts_requests
FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND status = 'Open'
  AND (
    logged_by = auth.uid()
    OR assigned_to = public.get_engineer_id(auth.uid())
  )
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND status IN ('Open', 'Cancelled')
  AND (
    logged_by = auth.uid()
    OR assigned_to = public.get_engineer_id(auth.uid())
  )
);

CREATE POLICY parts_requests_delete_own_open ON public.parts_requests
FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND status = 'Open'
  AND (
    logged_by = auth.uid()
    OR assigned_to = public.get_engineer_id(auth.uid())
  )
);

-- (b) office / admin / superadmin: any row in their org, any status
CREATE POLICY parts_requests_update_office ON public.parts_requests
FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
);

CREATE POLICY parts_requests_delete_office ON public.parts_requests
FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
);
```

Notes on how this behaves, since Postgres ORs permissive policies of the same command together:

- An engineer keeps write access only while their own request is `Open`; the moment office moves it to `Ordered`, `Ready to Fit`, or `Cancelled`, both engineer policies stop matching and the write is refused at the database level.
- The engineer `WITH CHECK` deliberately omits `status = 'Open'` so an engineer can still cancel or edit their own open request; the `USING` clause is what gates entry.
- Office/admin roles satisfy the (b) policies regardless of creator or status, so nothing about their current workflow changes.
- The role array matches `engineers_update` exactly, so a role added there needs adding here too.

Because engineers lose UPDATE on non-open rows, the frontend must not offer Ordered / Ready to Fit / Cancel controls in engineer views — those actions stay on the office Parts page and Job Detail. Verification after the migration: sign in as an engineer and confirm an update to a non-`Open` row is rejected, and that office can still move any row.
