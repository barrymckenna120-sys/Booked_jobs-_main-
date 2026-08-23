# BJ-0065 — Job picker on the engineer's standalone Parts sheet

## Status: already built, needs verification

The code change you're asking for shipped in the previous turn. Current state on disk:

- `src/components/engineer/PartsNeededSheet.tsx` — after a customer is picked, it loads that customer's 10 most recent jobs (identical query to the office sheet: `service_calls` by `customer_id`, `created_at desc`, limit 10) and renders a picker with a default `No job (phone order)` option that saves NULL.
- `src/pages/engineer/EngineerParts.tsx` line 208 — now passes `serviceCallId: selection?.serviceCallId ?? null` instead of the hardcoded `null`.
- `src/components/parts/NewPartsOrderSheet.tsx` (office) — untouched; still `serviceCallId: jobId || null` with its optional dropdown.
- No historical rows were modified.

So this plan is verification, not new implementation.

## What to do

1. Show the diff of the two engineer-side files plus confirmation the office sheet is unchanged (`git diff` / `git log` for `NewPartsOrderSheet.tsx`).
2. Drive the engineer app in a headless browser signed in as an engineer:
   - open My Parts, start a new part request, search and select a customer,
   - screenshot the job picker populated with that customer's jobs,
   - select a job, submit, then confirm in the database that the new `parts_requests` row carries the expected `service_call_id`.
3. Repeat with the `No job (phone order)` option selected and screenshot/confirm the row saves `service_call_id = NULL`.
4. Clean up: both probe rows are scratch data and get deleted after verification, per the scratch-data rule.

## Optional adjustment (say if you want it)

The picker currently lists the last 10 jobs regardless of status, matching the office dropdown exactly. Your task text says "recent open/scheduled jobs" — if you want completed/cancelled jobs filtered out on the engineer side only, that's a one-line change to the query, but it would make the two sheets behave differently.

## Technical notes

- Selection is carried by the existing `PartCustomerSelection` type (`customerId`, `customerName`, `serviceCallId`) so no change to `insertPartsRequest`'s signature was needed.
- Verification uses real inserts (the trigger and RLS path matter here), so the two probe rows are created under a scratch customer and removed afterwards.
