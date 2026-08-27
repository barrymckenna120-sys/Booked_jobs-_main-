# BJ-0069/0070 — Permanent parts record on the customer and job

Goal: a customer's parts history is complete and readable months later — part description, quantity, exact date/time ordered, and every status step with its own timestamp — without leaving the customer record.

## What gets built

### 1. "Fitted" as a real status
Parts currently stop at Ready to Fit. Add a fourth live status `Fitted` with its own `fitted_at` timestamp:
- Office and engineer parts screens gain a "Mark Fitted" step after Ready to Fit.
- Job completion marks any Ready to Fit parts on that job as Fitted automatically (timestamped at completion).
- Status colours/icons extended for Fitted (slate/green, distinct from Cancelled).

### 2. Parts section on the customer record (full detail)
A new "Parts" section on the Customer Detail page, reading parts requests directly so nothing depends on event logging:
- One block per part: quantity × description, priority, linked job reference (or "No job linked"), who logged it, notes.
- A vertical status trail per part with exact date and time for each step reached: Logged → Ordered → Ready to Fit → Fitted, or Cancelled (with who cancelled).
- Grouped newest-first, collapsed by default with a count, matching the existing collapsible sections.

### 3. Parts entries in the Activity Timeline
So parts also appear inline in chronological history alongside Job Booked / Job Completed:
- A database trigger writes one activity entry per transition (logged, ordered, ready to fit, fitted, cancelled), each with the part description, quantity, job reference and part id retained in its detail payload.
- The timeline gains coloured pills for these entries and shows the retained part detail under the label, not just a one-line summary.
- Only fires when the part is linked to a customer; job-linked parts inherit the job's customer so nothing is lost.

### 4. Backfill
A one-off data pass writes historical entries from every existing part's stored timestamps, so parts ordered before this change appear in the timeline with their real dates, not today's date.

### 5. Job Detail — Parts section (BJ-0069)
The existing parts card only appears when there are open parts. Replace it with a persistent "Parts" section that follows the page's existing card convention (icon + `text-base` title + count), placed after Job Information:
- Shows active parts with their action buttons as today, plus fitted and cancelled parts in a "History" group with timestamps.
- Renders nothing only when the job has never had a part.

## Technical notes

- Migration: `parts_requests.status` CHECK extended with `Fitted`; add `fitted_at timestamptz`, `fitted_by uuid`. New `log_parts_request_activity()` trigger on INSERT/UPDATE writing `customer_activity` rows with `event_type` values `part_logged`, `part_ordered`, `part_ready`, `part_fitted`, `part_cancelled` and `event_data` holding `{parts_request_id, description, quantity, priority, job_reference, status}`. Resolves `customer_id` from the row, falling back to the linked job. `organisation_id` always set. Actor resolved to `profiles.id` like the existing job triggers.
- Backfill runs as a separate data statement after the migration, keyed off `created_at`/`ordered_at`/`ready_at`/`cancelled_at`, guarded against re-running.
- Frontend: extend `src/lib/partsStatus.ts` (`PART_STATUS_CONFIG`, transitions) and `updatePartStatus` in `src/lib/partsRequests.ts` for Fitted; new `src/components/parts/CustomerPartsHistory.tsx` used by `CustomerDetail.tsx`; extend `PILL_CONFIG` and add an `event_data` detail renderer in `CustomerActivityTimeline.tsx`; rework `PartsNeededSection` in `JobDetail.tsx` into a persistent section with a history group. Timestamps via the existing `src/lib/partsDates.ts` helper (Europe/Dublin).
- `sync_job_status_from_parts` reviewed so Fitted is treated as resolved and does not hold a job in `parts_ordered`/`parts_arrived`.
- Unit tests for the status transition map, the Fitted-on-completion rule, and the status-trail builder. Verified live on a scratch job, then scratch data deleted.
