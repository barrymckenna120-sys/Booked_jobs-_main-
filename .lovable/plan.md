# Verify the two unchecked compact-row cases

Two visual cases from the "Today's Jobs — one job open, rest collapsed" change were never seen on screen: a compact row carrying a payment pill, and a compact row inside the Cancelled section. No code changes — verification only, plus two scratch jobs so the rows are reachable from the one available engineer login.

## What the data check found

Both cases already exist today in K&N Gas Services:

- KN-490 — deposit EUR 250 required and unpaid, revenue EUR 500, status Booked
- KN-462 — status Cancelled

Both are assigned to the engineer record "barry manager", which has no linked login, so neither job can be opened in the engineer app. The only engineer login available (`officeapp@bookedjobs.ie`, engineer "nicole office manager") has no job today with an outstanding deposit/balance and none cancelled.

## Test data to create

Two scratch jobs, today's date, assigned to nicole's engineer record, for the existing test customer "ZZ Scratch Boiler Audit" — no real customer or existing job row touched. They stay in place afterwards as fixtures.

1. Payment-pill row: created through the office New Job flow (`NewJobPanel`, Step 4) with "deposit required" set and no deposit collected — the same write path the office uses for a real deposit-request booking, so `deposit_required` / `deposit_paid` / `balance_due` land via the shared payment logic rather than hand-set values. Later time block so it is not the next job.
2. Cancelled row: created through the same New Job flow, then cancelled via the office cancel action (the real status-change path), not by writing `status` directly.

## Verification

Sign into the engineer app as the existing engineer login and capture, at phone viewport, on `/engineer/today`:

- The scratch deposit job rendering as a compact row under `REST OF DAY`, showing the amber deposit pill alongside the status chip.
- The scratch cancelled job rendering as a compact row under `CANCELLED` — same row component, not a full card.
- Confirm the pill text matches what `resolveDepositPill` produces for the same job (compare against the full card for an equivalent job).

Report both screenshots and confirm no console errors.

## Cleanup

After the screenshots, delete both scratch jobs through the app's real job-deletion path (office job delete action), not a raw row delete — so dependent rows and side effects are handled the way production does it. Then report a final query confirming zero scratch/test jobs remain scheduled for today.

## Technical notes

- Both jobs are created via the office UI (driven with Playwright as the office login) for the K&N tenant, assigned to nicole's engineer record, customer "ZZ Scratch Boiler Audit", scheduled today (Europe/Dublin).
- No direct `service_calls` field writes for the payment state. If the office flow turns out not to expose a deposit-required option that reaches the shared payment logic — or the cancel/delete actions are gated in a way this login cannot reach — I will stop and state that explicitly before considering a direct write, rather than falling back silently.
- `EngineerCompactJobRow` already reads `resolveDepositPill(job)` and `getStatusConfig(job.status)`, so no component change is expected; if the pill does not render, that is a real finding and gets its own fix prompt.
