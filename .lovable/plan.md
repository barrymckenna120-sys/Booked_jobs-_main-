# Verify standalone Take Payment (live, read-only)

No schema changes, no new features, no UPDATE statements. Verification only.

## Prerequisite (your side)

Sign out of the Lovable preview and sign back in as `barry@bookedjobs.ie`. The engineer session then injects into the sandbox on your next message. Until that happens the sandbox only sees `barrymckenna120@gmail.com`, which has no `public.engineers` row, so the engineer job list renders empty and no job card — and therefore no Take Payment link — can be reached.

## Steps once the engineer session is live

1. Restore the injected session into a headless browser and load the engineer job list.
2. Pick the target job with a read-only query against `service_calls` scoped to Barry's `organisation_id`, looking for a job whose payment fields classify as:
   - Case D — deposit due, not yet paid, or
   - Case A — deposit paid, balance still due.
   Prefer a job already assigned to Barry and visible on his list. If more than one qualifies, take the smallest outstanding balance. If none qualifies, report that and stop — no SQL-created test row.
3. Report the pre-state:
   `SELECT id, status, payment_method, revenue FROM service_calls WHERE id = '<job id>';`
4. Drive the UI: open that job's card, confirm the Take Payment link renders next to the deposit/balance pill, tap it, complete the PaymentSheet with any method, and screenshot before and after. Confirm the sheet closes, the page does not navigate away, and the status badge text is unchanged.
5. Report the post-state with the identical SELECT.
6. Present both rows side by side and state explicitly whether `status` changed (expected: unchanged) and whether `payment_method` / `revenue` updated (expected: updated).

## Notes

- All writes come from the app's own `onUpdate` path triggered by the tap-through — nothing is written by hand.
- Only the one chosen job row is touched. No other jobs, tenants, or tables.
- If the PaymentSheet flow errors mid-way, I report the failure and the post-state as-is rather than patching anything.
