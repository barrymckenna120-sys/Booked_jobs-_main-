# Stop one booking creating two jobs

## What's happening

Your fresh booking through book.kngasservices.ie arrived twice, 32 milliseconds apart, and created two jobs (KN-007 and KN-008) for the same customer, same date, same time slot. The sending automation gives each copy a *different* submission reference, so the existing "already received this submission" guard can't recognise them as the same booking.

The system already spots the pair — both jobs are correctly marked "possible duplicate" — but that's only a warning after the fact. The office still has two jobs to tidy up on every real booking.

## The fix

Turn today's after-the-fact duplicate warning into a guard that runs *before* a job is created, for form bookings only:

- When a booking arrives, check whether the same company already has a job for the same phone number, same job type, same address, same requested date and time slot, created in the last 10 minutes.
- If it does, don't create a second job — return the existing one and record the arrival as a duplicate, exactly like the existing same-reference case does.
- Because the two copies arrive milliseconds apart, a check alone can lose the race. So each booking first stakes a short-lived claim on its own fingerprint in a small new table with a uniqueness rule. Whichever copy claims first creates the job; the other is told the booking already exists. This makes the guard reliable even at 32 milliseconds apart.

Existing jobs, the duplicate warning badge, and manual office bookings are untouched — the guard applies only to bookings arriving through the forms.

## Second, smaller fix in the same area

When the automation replays an *old* submission whose job belongs to a different company, the endpoint currently answers with a server error (that's the 500 / "ConnectionError" you saw). It should recognise the reference as already used and answer normally instead of looking broken. No booking behaviour changes.

## Technical notes

- New table `booking_intake_claims`: `organisation_id`, `fingerprint` (hash of normalised phone + job type + address + scheduled date + time block), `service_call_id`, `created_at`; unique on (`organisation_id`, `fingerprint`) with rows older than the window ignored/purged. RLS on, service-role only, plus GRANTs.
- Reuse the existing `find_duplicate_job` / `_shared/duplicateJob.ts` contract for matching so there is still one algorithm; extend matching to include `scheduled_date` + `time_block` for the blocking path only, leaving the advisory flag behaviour unchanged.
- Applies in `tally-incoming-job` and `tally-boiler-rebook`, before the `service_calls` insert, after tenant binding.
- On unique-violation of `tally_submission_id`, re-query without the organisation filter and return the "already received" response instead of a 500.
- Tests: unit tests for the fingerprint builder and window logic; a regression test for the two-arrivals-in-one-second case; a regression test for the cross-tenant replay returning "already received".
- Deploy both edge functions explicitly after the change.

## Verification

- Automated tests plus type checks.
- One rebooking through rebook.kngasservices.ie (scratch details, test number) to confirm that form authenticates under K&N Gas Services Ltd — read back how it was identified.
- One fresh booking through book.kngasservices.ie afterwards to confirm exactly one job is created.

## Not in this plan

Closing the unauthenticated-booking fallback door (Stage 2), the Dublin Gas test jobs left as evidence, payments, and tenant isolation rules.
