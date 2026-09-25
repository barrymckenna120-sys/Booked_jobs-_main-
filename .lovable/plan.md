# K&N booking routing, branding and STOP replies: fix plan

## Blast radius (confirmed, read-only)
In the last 7 days, abdenneur1 (a test customer) is the only K&N customer who got a booking confirmation or deposit link with no job created: 5 times today, between 13:01 and 13:53 UTC. Every other message matches a job: KN-005, KN-011/012, KN-014 and KN-015. No real customers were affected.

## Why no job was created today
BookedJobs' booking intake last recorded a booking on 24/09 at 15:28. The messages sent today have no customer link, recipient or delivery status in our records. They came from Make, not from our intake. So today's retries went down a Make path that sends the messages but never calls BookedJobs.

## Step 1: Routing fix (in Make; you do this, I verify)
1. In the K&N booking scenario, the first step after the Tally trigger must send the booking to BookedJobs' booking intake (the same place the working 24/09 bookings used). It must include K&N's password and organisation.
2. Only send the confirmation and deposit link once our intake replies that it worked, using the job details it sends back. If the intake refuses or reports a duplicate, send nothing.
3. Remove or turn off the step that sends messages on its own.
4. Test: send one labelled booking for abdenneur1. I'll confirm exactly one new job, one customer match, one confirmation and one deposit link, and that the phone is unchanged (`+212656802656`).

## Step 2: Branding (in Make; you do this)
In the booking-confirmation message step, replace the fixed text "Thanks, Dublin Gas." with K&N's name. Better still, use the company name that our intake sends back, so this can't happen for other tenants. I'll check the next confirmation in the message log.

## Step 3: STOP replies (in 360 Messenger; you do this)
Set the incoming-message address to the BookedJobs inbound address with `?s=` and the inbound password on the end. Then send STOP from McKenna's test number, and I'll confirm the opt-out was recorded.

## Step 4: Cleanup (needs separate approval)
Close today's 5 open SumUp deposit links for abdenneur1 (they're sandbox, so no money involved) once the tests are finished.

## Notes
- I can't open or edit Make or 360 Messenger. Steps 1–3 happen in those accounts, and I verify each from BookedJobs' records afterwards.
- No BookedJobs code changes are needed for Steps 1–3.
- I'll add these items to the task list once you approve this plan.
