# Parts Needed: move to a dedicated parts table

Today parts information lives on `service_calls`: the engineer's part list is written into the shared `notes` column as `Parts Needed [Urgent]: ...`, priority/time go on `parts_priority` / `parts_logged_at`, and the workflow state is encoded in `status` (`parts_needed` → `parts_ordered` → `parts_arrived`). Two dead columns (`parts_status`, `parts_notes`) power a Dashboard panel that never shows anything because both are empty on all 468 jobs.

This plan introduces a proper `parts_requests` table so a job can have multiple parts, each with its own state, and stops overwriting job notes.

## What changes for users

- An engineer logging parts adds one or more part lines (description + priority) instead of one blob of text. Job notes are no longer overwritten.
- The office Parts page lists individual part lines grouped by job, each independently markable Ordered → Arrived → Fitted, with who logged it and when.
- The job card badge still reads "Parts Needed" / "Parts Ordered" / "Awaiting Booking" exactly as today — no visual change to badges, borders, or priority chips.
- The Dashboard "Parts" tab and its count start working (they are currently always empty).
- Existing parts jobs keep working: their current note text and priority are carried over into the new table as a single part line.

## Data model

New table `public.parts_requests`:

- `service_call_id` → `service_calls(id)` on delete cascade
- `customer_id` → `customers(id)` (denormalised for list views)
- `organisation_id` NOT NULL, no column default (per existing convention — set explicitly by the client/EF)
- `description` text NOT NULL
- `priority` text NOT NULL default `'normal'` — urgent / normal / low
- `status` text NOT NULL default `'needed'` — needed / ordered / arrived / fitted / cancelled
- `quantity` integer NOT NULL default 1
- `supplier` text, `cost` numeric, `notes` text (all nullable, for later use)
- `logged_by` uuid (auth user), `logged_by_name` text
- `ordered_at`, `arrived_at`, `fitted_at` timestamptz
- `created_at`, `updated_at` with the standard `update_updated_at_column()` trigger

Grants and RLS, in the required order after CREATE TABLE:

- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;` `GRANT ALL ... TO service_role;` no anon grant
- RLS enabled, policies scoped `organisation_id = get_my_org_id()` for select/insert/update/delete, mirroring `service_calls`

Job status stays the source of truth for badges. A trigger on `parts_requests` keeps `service_calls.status` in sync:

```text
any part 'needed'                    -> service_calls.status = 'parts_needed'
no 'needed', at least one 'ordered'  -> 'parts_ordered'
no 'needed'/'ordered', any 'arrived' -> 'parts_arrived'
all fitted/cancelled                 -> leave status alone (office reschedules)
```

The trigger only ever moves the job between those three parts statuses — it never overwrites Completed, Cancelled, Scheduled, etc.

Backfill: for each job currently in `parts_needed` / `parts_ordered` / `parts_arrived`, insert one `parts_requests` row using the regex-stripped `notes` text as `description`, `parts_priority` as priority, `parts_logged_at` as `created_at`, and status derived from the job status. `notes` is left untouched.

## Frontend work

Write paths:
- `src/components/engineer/PartsNeededSheet.tsx` — allow multiple part lines (add/remove rows), each with description + priority; returns an array.
- `src/components/engineer/EngineerJobCard.tsx` — insert `parts_requests` rows instead of patching `status`/`notes`/`parts_priority`; drop the `notes` overwrite.
- `src/pages/JobDetail.tsx` — same sheet, same insert path; office-logged parts now carry priority (currently dropped).

Read paths:
- `src/pages/Parts.tsx` — query `parts_requests` (join job + customer) instead of parsing `notes`; per-line Ordered / Arrived / Fitted actions; keep the existing sectioning and priority styling.
- `src/pages/JobDetail.tsx` `PartsNeededSection` / `PartsNeededNoteBlock` — render the part lines from the table; remove the `customer_call_notes` regex lookups (`note LIKE 'Parts Needed%'` / `'Parts ordered by%'`).
- `src/components/dashboard/PartsPanel.tsx` + `src/pages/Dashboard.tsx` count — repoint from the dead `parts_status` column to `parts_requests`, which makes the tab functional.
- `src/components/layout/AppLayout.tsx` nav count — count open part lines rather than jobs.
- Badges/borders unchanged: `job-card/StatusBadge.tsx`, `pages/Jobs.tsx`, `schedule/WeeklyGrid.tsx`, `schedule/JobSlotDrawer.tsx`, `pages/engineer/EngineerJobDetail.tsx` keep reading `service_calls.status`.

Left as-is this round: `send-part-arrived` keeps its current contract (job-level customer message on arrival); `PartsArrivedModal` still sets the job to `parts_arrived` and additionally marks the job's outstanding lines `arrived`.

## Technical notes

- Deprecate but do not drop `service_calls.parts_status` / `parts_notes` — both are entirely empty, so nothing reads real data from them; they are removed from `src/types/service-calls.ts` select list and left in place for a later cleanup migration.
- `parts_priority` / `parts_logged_at` remain on `service_calls` for the existing chips until the read paths are all switched, then stop being written.
- `organisation_id` gets no DEFAULT, matching `service_calls`.
- Regression tests: a unit test for the job-status derivation rule, and a test that the parts sheet emits multiple lines and does not touch `notes`.
