# Stranded Payment Detection (report only, no payment logic changes)

## Goal

Make a job that has been paid in full but is still marked unpaid/partial **visible** instead of silent. No change to how payments are calculated, recorded, or how receipts are triggered.

## Background

Both payment paths derive "money already collected" from `revenue − balance_due` rather than from the `job_payments` ledger. If `balance_due` is stale, a genuine balance payment computes as a part payment: the job stays `partial`, and the receipt never fires. That is the shape of the reported Paula White complaint. No live job is currently in that state on either tenant, so this step adds detection, not a fix.

## What gets built

**A read-only reconciliation view in the database, surfaced on the existing Finance screen for office/admin only.**

1. **Database view `payment_reconciliation_exceptions`** (read-only, no data written, no existing table touched):
   - Joins `service_calls` to a `job_payments` sum per job.
   - Flags a job when either:
     - ledger total ≥ `revenue` but `payment_status` is not `paid`, or
     - ledger total > 0 and `revenue − balance_due` disagrees with the ledger total by more than €0.01 (the stale-`balance_due` signal itself).
   - Excludes jobs with no payments at all, and jobs on `payment_method = 'invoice'`.
   - Returns: `job_reference`, `organisation_id`, `revenue`, `balance_due`, `payment_status`, `ledger_total`, `payment_count`, `receipt_sent`, `paid_at`.
   - Org-scoped through `get_my_org_id()` so K&N and Dublin Gas each see only their own rows.

2. **A "Payment exceptions" panel on the Finance page**, office/admin only:
   - Renders nothing when the view is empty (the normal case today).
   - When rows exist: a compact list of job reference, expected vs recorded, and a link to the job. No fix button, no writes — it is a report.
   - Loading / empty / error states handled with the existing `DataLoadError` component.

3. **One regression test** on the flagging predicate: a job with a €100 deposit + €100 balance on a €200 total and `payment_status = 'paid'` is NOT flagged; the same job left at `partial` IS flagged.

## Technical notes

- The view is a `CREATE VIEW` migration with a `GRANT SELECT ... TO authenticated`. It reads only; it defines no policies of its own and inherits the org filter from `get_my_org_id()` in its `WHERE` clause.
- No change to `paymentUpdate.ts`, `engineerPaymentPlan.ts`, `priorCollected.ts`, `sumupWebhook.ts`, or any receipt-send path.
- Files: one migration, one new panel component, one small edit to the Finance page to mount it, one test file.
- Verification: query the view directly for both tenants (expected: zero rows today), then confirm the panel renders nothing on Finance for both, and confirm an engineer role cannot see it.

## Deliberately not in scope

Changing the balance arithmetic to read the `job_payments` ledger as the source of truth. That is the actual fix and it touches live payment logic, so it belongs in its own Heavy TDD step once this report confirms whether the condition still occurs.
