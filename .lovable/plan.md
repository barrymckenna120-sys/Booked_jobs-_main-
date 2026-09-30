# Fix: a failed booking is silently lost when the form resends it

## Root cause (confirmed by reading the code)
Both booking intake functions (`tally-incoming-job`, `tally-boiler-rebook`) call `claimBookingIntake`, which inserts a row into `booking_intake_claims` **before** the customer/job is created. When customer or job creation then fails, the function returns 500 but **never removes the claim**. The row stays for 10 minutes with `service_call_id = null`. Any resend within the window hits the unique index (23505), is classed as `duplicate`, and gets `200 { success: true, id: null, duplicate: true }`. The sender stops retrying and no job exists.

A second, smaller gap: while the first copy is still running (claim present, no job attached yet), a second copy also gets `success: true` with no job id. If the first copy then fails, that booking is also lost.

## Fix (3 files)
1. `supabase/functions/_shared/bookingIntakeClaim.ts`
   - Add `releaseBookingIntakeClaim(supabase, claimId, logLabel)`: deletes that one claim row by id. Failures are logged, never thrown.
   - When a duplicate is found but the existing claim has no job attached yet, return a new outcome `pending` instead of `duplicate`.
2. `supabase/functions/tally-incoming-job/index.ts` and `supabase/functions/tally-boiler-rebook/index.ts`
   - On every failure after a successful claim (customer insert fails, job insert fails, unexpected error in the outer catch), call `releaseBookingIntakeClaim` before returning the existing error response. That way a retry can create the job.
   - When the outcome is `pending`, return a retryable `409 { success: false, reason: "booking_in_progress" }` instead of false success. The sender retries. By then the job is attached (the retry gets a true duplicate carrying the real job id) or the claim has been released (the retry creates the job).
   - True duplicates, where the claim has a job attached, behave exactly as today.

Unchanged: the 10-minute window, the unique index, submission-id guards, RLS, auth, tenant scoping and message content. No database migration.

## Verification
- Unit tests (Deno, with a mocked Supabase client) for the claim helper covering claimed, duplicate-with-job, pending and release.
- Scratch run against the Cavan / K&N TEST tenant only, with no messages to real customers:
  - Force the job insert to fail (invalid payload), then resend within 10 minutes. The first attempt returns 500 and the claim is gone. The retry creates exactly one job.
  - A successful booking creates one job. A resend returns `duplicate: true` with the same job id and no second job.
  - Two rapid parallel posts produce one job. The other copy gets a duplicate or 409, never a second job.
  - SQL read-back of `service_calls` and `booking_intake_claims` for each case.
- Tenant isolation: the claim lookup stays filtered by `organisation_id`. Confirm with a read-back that a tenant user cannot read another tenant's claims or jobs.
- Type check, focused tests, build. Deploy only these two functions, after approval, and report the version to roll back to.

## Remaining risk
- The sender must treat 409 as retryable. If Tally does not retry on 409, a pending copy is dropped. That is still safe, because the first copy either creates the job or its 500 triggers a retry. This will be confirmed from the function logs after deployment.
- If the function crashes hard mid-run (timeout or kill), the release code never runs. The claim then expires on the normal 10-minute window, the same as today.
