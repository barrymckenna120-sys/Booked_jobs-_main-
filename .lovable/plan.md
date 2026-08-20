# Verify the two unchecked compact-row cases

Two visual cases from the "Today's Jobs — one job open, rest collapsed" change were never seen on screen: a compact row carrying a payment pill, and a compact row inside the Cancelled section. No code changes — verification only, plus two scratch jobs so the rows are reachable from the one available engineer login.

## What the data check found

Both cases already exist today in K&N Gas Services:

- KN-490 — deposit EUR 250 required and unpaid, revenue EUR 500, status Booked
- KN-462 — status Cancelled

Both are assigned to the engineer record "barry manager", which has no linked login, so neither job can be opened in the engineer app. The only engineer login available (`officeapp@bookedjobs.ie`, engineer "nicole office manager") has no job today with an outstanding deposit/balance and none cancelled.

## Test data to create

Two scratch jobs, today's date, assigned to nicole's engineer record, for the existing test customer "ZZ Scratch Boiler Audit" — no real customer or existing job row touched. They stay in place afterwards as fixtures.

1. Payment-pill row: status Booked, later time block so it is not the next job, deposit required EUR 250, deposit unpaid, revenue EUR 500 — same shape as KN-490.
2. Cancelled row: status Cancelled, paid/zero balance so the pill does not confuse the check.

## Verification

Sign into the engineer app as the existing engineer login and capture, at phone viewport, on `/engineer/today`:

- The scratch deposit job rendering as a compact row under `REST OF DAY`, showing the amber deposit pill alongside the status chip.
- The scratch cancelled job rendering as a compact row under `CANCELLED` — same row component, not a full card.
- Confirm the pill text matches what `resolveDepositPill` produces for the same job (compare against the full card for an equivalent job).

Report both screenshots and confirm no console errors.

## Technical notes

- Inserts go into `service_calls` with `organisation_id` = K&N, `assigned_engineer_id` = nicole's engineer id, `customer_id` = the ZZ Scratch customer, `scheduled_date` = today (Europe/Dublin).
- Payment fields set directly to the target state rather than routed through payment helpers, since this is fixture data, not a payment flow test.
- `EngineerCompactJobRow` already reads `resolveDepositPill(job)` and `getStatusConfig(job.status)`, so no component change is expected; if the pill does not render, that is a real finding and gets its own fix prompt.
