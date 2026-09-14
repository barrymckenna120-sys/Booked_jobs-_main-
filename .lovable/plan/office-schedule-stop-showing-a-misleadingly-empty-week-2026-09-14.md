# Office Schedule — stop showing a misleadingly empty week

Small, contained fix to one screen. No caching work, no database changes,
no business logic changes.

## The problem

When the Schedule week fails to load (weak signal, dropped connection, a
request that times out), the page draws a complete week grid where every slot
reads "+ Assign". It looks like a genuinely empty diary rather than a failed
load. Office staff booking from that view could reasonably conclude the week is
free.

The failure is also recorded as a success, so the empty week is kept for a
minute before anything tries again.

## What changes

1. The week's jobs request stops swallowing failures — a failed load is
   reported as a failure instead of being turned into "no jobs".
2. When the load fails, the grid area is replaced by a short, calm message —
   "Couldn't load the schedule" with a "Try again" button — instead of empty
   slots. Nothing is bookable in that state.
3. While the week is loading for the first time, show a light placeholder
   rather than a fully drawn empty grid, so "still loading" and "genuinely
   empty" are no longer identical.
4. A truly empty week keeps its current appearance exactly as it is today.

Everything else on the page is untouched: week navigation, the engineer filter,
unallocated jobs, assigning, cancelling, completing, live updates, and the
existing offline banner all behave as they do now.

Automatic refresh when the connection returns already works and stays.

## Not in this change

Storing a copy of the week on the device for offline viewing. With failures made
visible, offline Schedule shows an honest error, which is acceptable for office
staff on WiFi. Left as a follow-up item.

## Technical notes

- `src/pages/Schedule.tsx`, the `["schedule-jobs", ...]` query: throw on the
  PostgREST error instead of falling through to `rows = scheduledJobs || []`, so
  React Query records an error state rather than caching an empty success.
  Existing global retry/backoff and `refetchOnReconnect` in `src/lib/queryDefaults.ts`
  then apply unchanged.
- Destructure `isError`, `isLoading` and `refetch` from that same query and
  branch the grid region only. `WeeklyGrid`, `UnallocatedJobs`, `AssignJobModal`
  and `JobSlotDrawer` are not modified.
- Error/loading states use existing shared UI primitives and semantic tokens; no
  new dependencies.
- The `engineers` and `settings` queries are left alone — they degrade to
  sensible defaults (all-engineer view, default time blocks) rather than
  misinformation.

## Verification

- Typecheck and the existing Vitest suite.
- Playwright at desktop and mobile widths with the jobs request forced to fail:
  confirm the error state renders, "Try again" refetches, and no empty bookable
  slots appear.
- Confirm a normal load and a genuinely empty week are visually unchanged.
