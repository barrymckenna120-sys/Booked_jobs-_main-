# Replace 24h "New" badge with real customer-status badge in UnallocatedJobs

## Goal
Close BJ-0051 and the schedule-card piece of BJ-0047 by replacing the misleading 24-hour freshness badge in `UnallocatedJobs.tsx` with a badge driven by `service_calls.customer_status_at_booking`.

## Changes
1. **src/pages/Schedule.tsx**
   - Add `customer_status_at_booking?: string | null;` to the `ScheduleJob` type.
   - Pass `j.customer_status_at_booking || null` through in the row mapping.

2. **src/components/schedule/UnallocatedJobs.tsx**
   - Remove the `isNew(dateStr)` freshness helper and the `differenceInHours` import.
   - Add `UserPlus` icon import.
   - Replace the `{isNew(job.created_at) && ...}` badge with a real badge rendered only when `job.customer_status_at_booking === "new"`.
   - Use the same emerald visual treatment (`bg-emerald-500/15 text-emerald-600 border-emerald-500/20`) and label "New Customer" to match the engineer app.

## Out of scope
- `WeeklyGrid.tsx` status filter (BJ-0052) — separate concern, different file.
- No other components touched.

## Verification
- Typecheck passes.
- Screenshot of schedule/unallocated view showing a job with `customer_status_at_booking = 'new'` displaying the badge.
- Screenshot of a job with `'existing'` or `null` showing no badge.
