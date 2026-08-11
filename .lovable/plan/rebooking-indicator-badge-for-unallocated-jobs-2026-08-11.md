# Rebooking Indicator Badge for Unallocated Jobs

## Goal
Add a small amber “Renewal” indicator badge to each job card in the `Unallocated Jobs` board, visible only when `source === "Renewal"`.

## Files to change
- `src/pages/Schedule.tsx` — minimal data plumbing only
- `src/components/schedule/UnallocatedJobs.tsx` — UI change only

## Plan

1. Data plumbing
   - Add `source?: string | null` to the `ScheduleJob` type in `src/pages/Schedule.tsx`.
   - Map `source: j.source || null` in the `service_calls` query transform so the field reaches the card.

2. Badge UI
   - In `src/components/schedule/UnallocatedJobs.tsx`:
     - Import `RotateCw` from `lucide-react`.
     - Add a small inline badge rendered only when `job.source === "Renewal"`.
     - Place it directly after the job-type tag in the same flex row.
     - Style it as an amber pill matching the existing “New” pill sizing (border-radius, padding, text scale):
       ```text
       bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]
       ```
     - Use the `RotateCw` icon at size 12 with no accompanying text.

3. Scope guardrails
   - Do not alter the existing “New” pill, job-type tag, media count badge, or any other card element.
   - Do not touch the engineer app or any other component/page.

4. Verification
   - Run `tsgo --noEmit` to confirm type safety.
   - Inspect the live Unallocated Jobs board and confirm the badge appears only on the 5 jobs with `source = "Renewal"`.
