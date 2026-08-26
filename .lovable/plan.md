# BJ-0078 — Show "New Customer" badge on Tally incoming jobs

## What the audit found

- The backend is correct and live. `tally-incoming-job` sets `customer_status_at_booking` to `new` or `existing` on every job it creates (line 341), and recent Tally rows in the database confirm both values are being written (KN-516 = `new`, DG-443/KN-515/KN-512 = `existing`).
- The gap is purely in the Incoming Jobs screens: none of `src/pages/IncomingJobs.tsx`, `src/components/incoming/IncomingJobCard.tsx`, `src/components/incoming/JobReviewPanel.tsx` or `src/components/jobs/ScheduleIncomingJobModal.tsx` reference `customer_status_at_booking` or the `NewCustomerBadge` component. So a Tally job for a brand-new customer looks identical to one for a returning customer until it has been scheduled and appears on Jobs/Schedule, which already show the badge.

## The fix

Presentation only — reuse the existing shared badge, no new logic and no backend change.

1. `src/pages/IncomingJobs.tsx` — add `customer_status_at_booking?: string | null` to the local `IncomingJob` type and pass it down. The query already uses `select("*")`, so the value is present in the fetched rows; no query change needed.
2. `src/components/incoming/IncomingJobCard.tsx` — render `<NewCustomerBadge status={job.customer_status_at_booking} size="sm" />` next to the customer name, matching how the Jobs list and Schedule cards place it.
3. `src/components/incoming/JobReviewPanel.tsx` — render the badge (default size) beside the customer name in the panel header, so it stays visible while the office reviews and schedules the job.

## Not changing

- No edge function, migration, or data change. `tally-boiler-rebook` keeps its hardcoded `existing` (unmatched rebooks never create a job), and the historic Tally rows with a `NULL` value stay untouched — the badge simply doesn't render for them.

## Verification

- Open Incoming Jobs and confirm the emerald "New Customer" badge appears on a job whose `customer_status_at_booking` is `new` and is absent for `existing`/`NULL`.
- Check the review panel header shows the same badge, and that mobile card layout doesn't wrap awkwardly.
- No console errors; Jobs/Schedule badges unchanged.
