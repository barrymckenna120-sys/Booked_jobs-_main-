# Tally enquiry not showing — diagnosis and fix

## What actually happened (verified in production logs)

Your submission did reach BookedJobs. It was accepted as genuine, matched to the
right company, and then failed at the very last moment.

Traced for submission reference `6D5AAAe`:

1. Tally called the endpoint twice — 15:33 and 15:42 (its automatic retry).
2. The password check passed. Authentication is not the problem.
3. The form was recognised and resolved to **New Gas Boilers Dublin**
   (`59bb0688-...`). Form-ID binding is not the problem.
4. It then tried to create the customer record and was refused by the database:
   the customer's **phone number was empty**, and a customer cannot be saved
   without a phone number.
5. Because the customer could not be created, no enquiry was created either.
   The request returned an error (HTTP 500), so nothing was saved and nothing
   could appear in the list.

So: nothing is hidden, nothing is a permissions or filter problem. There is
genuinely no enquiry record. Confirmed — this company still has zero customers
and zero enquiries; the only two enquiries in the system are the Cavan test ones.

## Why the phone was empty

The endpoint reads the phone answer by matching the question's name against a
fixed list ("phone", "mobile", "phone number", "contact number", "telephone").
Your live form's phone question is almost certainly worded differently (for
example "Best number to reach you on?"), so the answer was there but not
recognised. A second gap made it fail hard rather than degrade: the validation
step accepts a submission with an email and no phone, but the customer record
requires a phone — so those two rules disagree.

The exact wording cannot be confirmed from the logs because the failed payload
is not kept (only the submission reference is), which is itself a diagnosability
gap worth closing.

## Fix (smallest safe change, one Edge Function only)

1. **Tolerant phone matching** — accept any question whose wording contains
   "phone", "mobile", "number" or "tel", instead of only the exact aliases.
   Same tolerance for email, name, address and eircode so the next reworded
   question doesn't cause the same failure.
2. **Make the two rules agree** — if no phone can be found, stop with a clear
   "no contact number supplied" message before touching the database, instead of
   a database error. No placeholder phone is invented.
3. **Keep the payload on failure** — store the submission's question names (not
   the answers) in the existing diagnostic log so a mapping mismatch is
   self-evident next time.
4. **Recover this submission** — replay the same submission reference once the
   fix is live so this enquiry lands for real, with the same reference so no
   duplicate is possible. If Tally's retry window has passed, submitting the
   test form again is equally fine.
5. **Verify by read-back** — enquiry exists under New Gas Boilers Dublin only,
   every answer in the right field, photos copied, office notified, replay
   returns the same enquiry.

Nothing else changes: no database migration, no policy change, no secret change,
no other company, no booking/quote/payment/WhatsApp behaviour.

## One thing to note about the dashboard

Boiler Enquiries is its own office page; the main dashboard does not include a
boiler-enquiry count today. Adding one is a separate, optional change — say the
word and I'll plan it after this fix.

## Technical detail

- Failure stage recorded: `customer_insert_failed: null value in column "phone"
  of relation "customers" violates not-null constraint`, logged twice for
  `submission_id 6D5AAAe`, org `59bb0688-09bf-451c-aa0e-c920521069fe`.
- Edge request log: `POST /functions/v1/tally-boiler-enquiry → 500` at 15:42:54.
- Cause in code: `pick(flat, ["phone","mobile","phone_number","mobile_number",
  "contact_number","telephone"])` in `_shared/boilerEnquiryPayload.ts` requires
  an exact slug match on the field key or label; `validate` only requires phone
  **or** email, while `customers.phone` is NOT NULL.
- Files touched by the fix: `supabase/functions/_shared/boilerEnquiryPayload.ts`
  plus its tested twin `src/lib/boilerEnquiryPayload.ts` (the mirror test
  enforces they stay identical), and one guard in
  `supabase/functions/tally-boiler-enquiry/index.ts`. New unit tests for
  reworded phone/email/name labels and for the phone-missing rejection.
