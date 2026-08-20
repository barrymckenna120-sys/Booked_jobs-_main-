# Today's Jobs — one job open, rest collapsed

## Problem
On the engineer Today screen every job renders as a full-size card, so the day looks like a long wall of identical cards. Only the next job should be fully open; the rest of the day should sit underneath as a short, tappable list.

## What changes
- The **Next Job** keeps the current full card exactly as it is today (status, pills, quick actions, En Route / Complete buttons, messages, media).
- Every other active job today becomes a **compact one-line row** under the existing `SectionDivider`, label `REST OF DAY` (same uppercase/centred style already used for `CANCELLED`):
  - Time block (e.g. `2pm–5pm`) on the left
  - Customer name, address on a second line
  - Small status chip, plus the deposit/balance pill when money is due — sourced from `resolveDepositPill` so pill text matches the full card exactly
  - "New Customer" chip when `customer_status_at_booking === 'new'` (existing field, no new derivation)
  - Chevron on the right
- Tapping a compact row opens that job's detail screen (`/engineer/job/:id`).
- Cancelled jobs stay in their existing "Cancelled" section, switched to the same compact row so they stop dominating the screen.
- Stats trio, Outstanding Balances banner, Needs Attention card and Switch to Office App stay exactly where they are.

## Out of scope
- The Upcoming tab (`EngineerUpcoming.tsx`) — tomorrow's jobs live there, untouched.
- Data fetching, `useEngineerJobs`, payment logic, `PrimaryActions` — unchanged.

## Empty / edge cases
- Only one job today: full card, no `REST OF DAY` divider.
- No active jobs: existing empty / all-done states unchanged.
- A job that goes En Route or In Progress is already promoted to next-job position by existing logic, so it becomes the open card automatically.

## Technical notes
- New presentational component `src/components/engineer/EngineerCompactJobRow.tsx`.
- Reuses `resolveDepositPill` and `StatusBadge` from `src/components/engineer/job-card/` — no payment or status rules duplicated.
- `src/pages/engineer/EngineerToday.tsx`: render `sortedActive[0]` with `EngineerJobCard`, map the remainder through the new row component; cancelled list switches to the same row component.

## Verification
- Screenshot `/engineer/today` for the K&N account: one open card plus collapsed rows.
- Screenshot of a compact row for a job with money actually due, confirming the deposit/balance pill renders (not just the status chip).
- Screenshot of the single-job case — full card, no `REST OF DAY` divider.
- Screenshot of the Cancelled section rendering as compact rows.
- Tap a collapsed row and confirm it lands on the correct job detail.
- Typecheck clean, no console errors, mobile viewport check.
