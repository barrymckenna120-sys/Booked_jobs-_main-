# Today's Jobs — one job open, the rest collapsed

## Problem
On the engineer Today screen every job renders as a full-size card, so the day looks like a long wall of identical cards. Only the next job should be fully open; the rest of the day should sit underneath as a short, tappable list.

## What changes
- The **Next Job** keeps the current full card exactly as it is today (status, pills, quick actions, En Route / Complete buttons, messages, media).
- Every other active job today becomes a **compact one-line row** under a "Rest of Day" divider:
  - Time block (e.g. `2pm–5pm`) on the left
  - Customer name, then address on a second line
  - Small status chip, plus the deposit/balance pill when money is due
  - "New Customer" chip when applicable
  - Chevron on the right
- Tapping a compact row opens that job's detail screen (`/engineer/job/:id`), which already has every action.
- Cancelled jobs stay in their existing "Cancelled" section, also as compact rows so they stop dominating the screen.
- Stats trio, Outstanding Balances banner, Needs Attention card and Switch to Office App stay exactly where they are.

## Empty / edge cases
- Only one job today: full card, no "Rest of Day" divider.
- No active jobs: existing empty / all-done states unchanged.
- A job that goes En Route or In Progress is already promoted to next-job position by the existing logic, so it becomes the open card automatically.

## Technical notes
- New presentational component `src/components/engineer/EngineerCompactJobRow.tsx`; reuses `resolveDepositPill` from `job-card/InfoPills.tsx` and `job-card/StatusBadge.tsx` so no payment or status rules are duplicated.
- `src/pages/engineer/EngineerToday.tsx`: render `sortedActive[0]` (the next job) with `EngineerJobCard`, and map the remainder through the new row component. Cancelled list switches to the same row component.
- No changes to data fetching, `useEngineerJobs`, payment logic, or `PrimaryActions`.

## Verification
- Screenshot `/engineer/today` for the K&N engineer account showing one open card plus collapsed rows.
- Tap a collapsed row and confirm it lands on the correct job detail.
- Typecheck clean, no console errors, mobile viewport check.
