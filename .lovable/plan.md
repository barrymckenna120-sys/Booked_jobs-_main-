# KN-512 matching: findings and follow-up

## What the audit found

KN-512 was stored as `customer_status_at_booking = 'existing'` and that is correct
behaviour, not a bug:

- `+353872354257` is shared by 12 customer rows in the K&N organisation (test data
  accumulated since February).
- `matchCustomer` step 1 (exact E.164 phone) matched, and the documented tie-break
  (`updated_at desc`, then `created_at desc`, then `id asc`) selected
  `joey the slips` (`0f611303-…`, updated 2026-08-20 14:35:51).

Two consequences worth acting on:

1. Any future Tally booking from that number will always be `existing`, so it can
   never be used to test the "new customer" path again.
2. The winning row is unstable — editing any of the other 11 duplicates changes
   which customer the next booking attaches to.

## Proposed follow-up (pick one or both)

### A. Clean up the duplicate test rows (recommended, data-only)

Produce a report of the duplicate groups (rows sharing a last-9 phone key) with
job/quote/invoice counts per row, so it's clear which rows are safe to remove.
Nothing is deleted without your explicit approval on the report.

No code changes. Removes the instability at the source.

### B. Use a reserved scratch number for future status testing

Keep a dedicated unused test number for verifying the `new` path, and stop
reusing `+353872354257` for booking tests. Documented as a project rule so it is
applied automatically in future verification runs.

## Not proposed

- No change to `_shared/matchCustomer.ts`. Its tie-break is behaving exactly as
  specified; loosening or tightening it to work around duplicated test data would
  change live matching for real customers.
- No change to `tally-incoming-job`. The field is set on the only `service_calls`
  insert; the other exit paths return an existing row without inserting.
