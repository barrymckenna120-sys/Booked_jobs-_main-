# Correct production booking sender identity

## Goal
Update only the external Tally/Make sender configuration for `book.kngasservices.ie` and `rebook.kngasservices.ie`, using the working dev flows as the structural reference. No BookedJobs code, tenant-resolution logic, or existing stray bookings will be changed.

## Confirmed current state
- Both BookedJobs handlers accept `x-webhook-secret` (or `x-make-secret`) as the preferred company identity.
- The booking handler reads `organisation_id` from the request body and rejects it if it conflicts with the company resolved from the secret.
- The rebooking handler follows the same rule.
- No Make.com workspace connection is currently available in this session, so the sender scenarios cannot yet be inspected or changed directly. The skipped access question leaves this as the only execution blocker.

## Plan
1. Obtain approved access to the two Make scenarios, or inspect secret-redacted scenario blueprints supplied by the user.
2. Compare the working dev and production scenarios module-by-module:
   - Tally trigger/form selected
   - webhook destination (`tally-incoming-job` versus `tally-boiler-rebook`)
   - request method and JSON body mapping
   - `x-webhook-secret` or `x-make-secret` header mapping
   - `organisation_id` body mapping
   - any form IDs or other company identifiers
3. Record the exact dev-specific sender fields before making changes, without printing either secret.
4. Change only the two production scenarios:
   - set the production tenant's existing Tally webhook secret in the private header
   - set any body `organisation_id` to the production organisation
   - preserve every unrelated trigger, field mapping, scheduling rule, and dev scenario
5. Re-read both production scenarios and compare them with dev to confirm structural parity while company IDs and secrets remain distinct.
6. Submit one uniquely identifiable test through each public production form.
7. Verify each request resolved via `tenant_secret`, created its record only under K&N Gas Services Limited, and appeared in Jobs and Schedule.
8. Verify no corresponding record was created under the old dev company, the existing dev automation remains unchanged, and another tenant cannot read the new production records.
9. Report only the requested headings, with all secrets redacted.

## Stop conditions
Stop without changing BookedJobs if Make access is unavailable, either scenario cannot be identified confidently, a production secret is absent, or a test fails. Report the exact blocker or failed step; do not modify KN-538 or KN-539.
