# BJ-0078 — `parts_arrived` engineer treatment

Engineer-facing label becomes **"Parts Ready to Fit"**, and a job whose parts are ready gets the same visual/action treatment `parts_needed` and `parts_ordered` already have. Office-side copy ("Awaiting Booking") stays as-is — it is correct for the notify-customer flow that also writes this status.

## Point 3 confirmation (no side effects)

Re-confirmed from the audit reads: `parts_arrived` is consumed as a *string* only by presentation code (engineer badge, office badge/label maps, schedule grid, slot drawer) plus the status-sync logic that *writes* it (`recompute_job_parts_status()` in the database and its pure mirror `deriveJobStatusFromParts`). Neither the trigger, the sync helper, nor any Edge Function or report reads the label text. The `parts_arrived` string in `WhatsApp.tsx` is a `message_log.message_type`, unrelated to job status. Changing engineer-facing copy and styling therefore has no automation, reporting, or office-side effect. No database writes in this change.

## Changes

1. `src/components/engineer/job-card/StatusBadge.tsx` — `parts_arrived` label `"Awaiting Booking"` → `"Parts Ready to Fit"`. Colours unchanged (`#7C3AED` on `#F3E8FF`).
2. `src/components/engineer/EngineerJobCard.tsx` — include `parts_arrived` in `isPartsStatus`; add purple `#7C3AED` left-border case; add the one-line note "Parts ready to fit — book the return visit", matching the existing parts_ordered note line.
3. `src/components/engineer/job-card/PrimaryActions.tsx` — add `parts_arrived` to the same branch as `parts_needed` / `parts_ordered`, so the card shows **Complete** plus "Can't complete this job?" (Cancel / No Access). Today it shows no action at all.
4. `src/pages/engineer/EngineerJobDetail.tsx` — add a `parts_arrived` entry to `STATUS_CONFIG` (purple), a purple `PackageCheck` callout banner "Parts Ready to Fit / Parts are in — book the return visit" alongside the existing two banners, and include `parts_arrived` in the reschedule status reset (line 602) so rescheduling clears it to `Scheduled` like the other parts statuses.

## Out of scope

- Office copy on Jobs list, Job Detail, Schedule grid, slot drawer.
- `useEngineerJobs` Today-screen status whitelist (separate BJ-0077 gap).
- Any database or trigger change.

## Verification

- Playwright screenshots of the engineer card for `parts_needed`, `parts_ordered` and `parts_arrived` side by side, showing border tint, callout and the new label.
- Screenshot of the engineer job detail banner for a `parts_arrived` job.
- Typecheck clean, no console errors, mobile viewport check.
