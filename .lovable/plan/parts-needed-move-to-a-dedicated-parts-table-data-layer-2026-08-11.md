# Parts Needed: move to a dedicated parts table (data layer)

Today parts information lives on `service_calls`: the engineer's part list is written into the shared `notes` column as `Parts Needed [Urgent]: ...`, priority/time go on `parts_priority` / `parts_logged_at`, and the workflow state is encoded in `status` (`parts_needed` → `parts_ordered` → `parts_arrived`). Two dead columns (`parts_status`, `parts_notes`) power a Dashboard panel that never shows anything because both are empty on all 468 jobs.

This plan is the **data layer only**: a `parts_requests` table, its access rules, the job-status sync trigger, and the backfill. The five items under "Follow-up work" are required, tracked, and out of scope here.

## Decision: one row per part line, multiple lines per job

Explicit decision, not an assumption: **one `parts_requests` row = one part**. A job can have many rows. The engineer sheet lets them add/remove rows and submits them as a batch of inserts in one action. Each row carries its own priority, status and timestamps, so office can order one part and still be waiting on another for the same job. Single-part-per-request is rejected.

## What changes for users

- An engineer logging parts adds one or more part lines (description + priority) instead of one blob of text. Job notes are no longer overwritten.
- Office can log a **phoned-in parts order with no job attached at all**, and even with no customer record — just a name/address/phone typed in.
- Office can assign a request to a specific engineer, independently of who logged it.
- The office Parts page lists individual part lines, each independently movable Open → Ordered → Ready to Fit (or Cancelled).
- The job card badge still reads "Parts Needed" / "Parts Ordered" / "Awaiting Booking" exactly as today — no change to badges, borders, or priority chips.
- The Dashboard "Parts" tab and its count start working (they are currently always empty).
- Existing parts jobs keep working: their current note text and priority are carried over as a single part line.

## Status values

Exactly four, used verbatim in the column, the backfill and the trigger:

`'Open'`, `'Ordered'`, `'Ready to Fit'`, `'Cancelled'`

There is no separate "fitted" state — "Ready to Fit" means the part has arrived and is ready, matching the engineer-facing wording. A request leaves the active pool when the job is completed or the request is Cancelled.

## Data model

New table `public.parts_requests`:

- `id` uuid PK
- `service_call_id` uuid **NULL**, references `service_calls(id)` ON DELETE SET NULL — null means a parts order with no job
- `customer_id` uuid NULL, references `customers(id)`
- `customer_name` text NULL, `customer_address` text NULL, `customer_phone` text NULL — used when there is no customer record yet
- `organisation_id` uuid NOT NULL, **no column default** (matches `service_calls`; set explicitly by the caller)
- `description` text NOT NULL
- `quantity` integer NOT NULL default 1
- `priority` text NOT NULL default `'normal'` — urgent / normal / low
- `status` text NOT NULL default `'Open'` — Open / Ordered / Ready to Fit / Cancelled
- `notes` text NULL
- `logged_by` uuid NULL (auth user id), `logged_by_name` text NULL — who created it
- `assigned_to` uuid NULL, references `engineers(id)` — who it's for; independent of `logged_by`, null = unassigned. Set/changed by any office/admin regardless of who created the row (the update policy is org-scoped, not creator-scoped)
- `ordered_at`, `ready_at`, `cancelled_at` timestamptz NULL
- `created_at`, `updated_at` timestamptz NOT NULL default now(), with the standard `update_updated_at_column()` trigger

No `supplier` and no `cost` column — structured supplier/cost tracking is explicitly out of scope for this feature on both engineer and office side.

A validation trigger (not a CHECK) enforces that a row has at least one way to identify the customer: `customer_id IS NOT NULL OR customer_name IS NOT NULL`.

Grants and RLS, in the required order after CREATE TABLE:

- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_requests TO authenticated;`
- `GRANT ALL ON public.parts_requests TO service_role;`
- no anon grant
- RLS enabled; select / insert / update / delete policies all scoped `organisation_id = get_my_org_id()`, mirroring `service_calls`

## Job status sync trigger — explicit logic

`service_calls.status` remains the source of truth for the badges. An AFTER INSERT/UPDATE/DELETE trigger on `parts_requests` recomputes the parent job's status. It runs only when `service_call_id IS NOT NULL`; a request with no job never touches any job row.

Eligible-to-overwrite set (and nothing else):

```text
OVERWRITABLE = ('Scheduled', 'Booked', 'En Route', 'On Site',
                'parts_needed', 'parts_ordered', 'parts_arrived')
```

Never touched, regardless of parts state: `'Completed'`, `'Cancelled'`, `'In Progress'`, `'no_show'`, `'Awaiting Deposit'`, `'Pending'`, and any status not in the list above.

`'In Progress'` is explicitly **excluded** — an engineer working on site keeps that signal even if they log a part mid-job. The parts badge still appears on that job from the `parts_requests` rows themselves; only the job's own `status` string is left alone.

```text
IF affected job.status NOT IN OVERWRITABLE THEN
    do nothing, return
END IF

-- consider only that job's rows with status in (Open, Ordered, Ready to Fit)
IF   any row status = 'Open'          THEN job.status := 'parts_needed'
ELSIF any row status = 'Ordered'      THEN job.status := 'parts_ordered'
ELSIF any row status = 'Ready to Fit' THEN job.status := 'parts_arrived'
ELSE
    -- no active rows left (all Cancelled or all deleted):
    IF job.status IN ('parts_needed','parts_ordered','parts_arrived')
        THEN job.status := 'Scheduled'   -- hand back to office to schedule
        ELSE leave unchanged
    END IF
END IF
```

The trigger writes only `status`; it never modifies `notes`, dates, engineer assignment, or payment fields.

## Backfill

For each job currently in `parts_needed` / `parts_ordered` / `parts_arrived`, insert one `parts_requests` row:

- `description` = `notes` with the `Parts Needed [x]:` prefix stripped
- `priority` = `parts_priority`, defaulting to `'normal'`
- `created_at` = `parts_logged_at` where present, else the job's `updated_at`
- `status`: `parts_needed → 'Open'`, `parts_ordered → 'Ordered'`, `parts_arrived → 'Ready to Fit'`
- `organisation_id`, `customer_id`, `service_call_id` copied from the job; `assigned_to` = the job's `assigned_engineer_id`

`service_calls.notes` is left untouched. Backfill runs with the sync trigger disabled so no job status is disturbed.

## Frontend work in this stage

Write paths:
- `src/components/engineer/PartsNeededSheet.tsx` — multiple part lines (add/remove rows), each description + priority; returns an array.
- `src/components/engineer/EngineerJobCard.tsx` — insert `parts_requests` rows instead of patching `status` / `notes` / `parts_priority`; the `notes` overwrite is removed.
- `src/pages/JobDetail.tsx` — same sheet and insert path; office-logged parts now carry priority (currently dropped).

Read paths:
- `src/pages/Parts.tsx` — query `parts_requests` (left-joining job and customer, so job-less requests still appear) instead of parsing `notes`; per-line Ordered / Ready to Fit / Cancel actions; keep existing sectioning and priority styling.
- `src/pages/JobDetail.tsx` `PartsNeededSection` / `PartsNeededNoteBlock` — render part lines from the table; remove the `customer_call_notes` regex lookups (`note LIKE 'Parts Needed%'` / `'Parts ordered by%'`).
- `src/components/dashboard/PartsPanel.tsx` and the `parts-count` query in `src/pages/Dashboard.tsx` — repoint from the dead `parts_status` column to `parts_requests`, which makes the tab functional.
- `src/components/layout/AppLayout.tsx` nav count — count open part lines rather than jobs.
- Badges/borders unchanged: `job-card/StatusBadge.tsx`, `pages/Jobs.tsx`, `schedule/WeeklyGrid.tsx`, `schedule/JobSlotDrawer.tsx`, `pages/engineer/EngineerJobDetail.tsx` keep reading `service_calls.status`.

`send-part-arrived` keeps its current contract (job-level customer message); `PartsArrivedModal` still sets the job to `parts_arrived` and additionally moves that job's active lines to `'Ready to Fit'`.

## Follow-up work, not included in this migration

Required, tracked, not optional:

1. Trigger notifying all office/admin users when an engineer cancels a request (`status → 'Cancelled'`), reusing the same fan-out pattern as `notify_on_job_change()`.
2. Trigger notifying the assigned/logging engineer when office changes a request's notes or status — same fan-out mechanism, targeted at that one engineer.
3. Engineer-facing "My Parts" list (their own logged + assigned requests across all jobs), inside the existing Jobs section of engineer nav — no new bottom nav icon.
4. Edit/Cancel on a request available only while `status = 'Open'`; once Ordered or Ready to Fit the engineer sees a "message office to change or cancel" prompt instead of self-service controls.
5. A distinct icon for "Ready to Fit", visually different from the icon used for the job's own Complete action.

## Technical notes

- Deprecate but do not drop `service_calls.parts_status` / `parts_notes` — both are entirely empty, so nothing reads real data from them; they come out of the `src/types/service-calls.ts` select list and get dropped in a later cleanup migration.
- `parts_priority` / `parts_logged_at` stay on `service_calls` for the existing chips until all read paths are switched, then stop being written.
- Regression tests: unit tests for the status-derivation rule including the Completed / Cancelled / In Progress no-op cases and the job-less (`service_call_id IS NULL`) case, plus a test that the parts sheet emits multiple lines and does not touch `notes`.
