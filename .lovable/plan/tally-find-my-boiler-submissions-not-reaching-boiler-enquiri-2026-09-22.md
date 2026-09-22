# Tally "Find My Boiler" submissions not reaching Boiler Enquiries

## Root cause (confirmed from the live submissions)

Four real submissions from form 68qaMe reached BookedJobs today and were all
correctly authenticated and correctly matched to New Gas Boilers Dublin. None
were saved, so the office list had nothing to show — this is not a display,
filter, permission or tenant-isolation problem.

The failure is field matching. The live form's own question wording differs from
what the intake understood:

- The mobile question is labelled **"Moblie No"** (spelled that way on the form).
  Nothing in the matcher recognises that spelling, so no phone number was read.
  Since a customer cannot be saved without a phone number, the whole submission
  was rejected — first as a database error (15:33, 15:42), then, after this
  afternoon's change, as a clean refusal (15:55, 15:57).
- The same mismatch silently affects most other answers. Of the form's 21
  questions, only property, bedrooms, address, Eircode and email are understood
  today. Boiler type, age of boiler, current boiler location, number of
  radiators, number of bathrooms, two-showers-at-once, water pressure, existing
  cylinder/pump, priority (labelled "Priorty"), interested extras, timeframe,
  preferred contact method and the boiler photos would all have been stored
  blank even if the phone number had been read.
- One latent hazard: the loose name match can also match Tally's own
  "formName" field, so a submission could be saved with the form's name instead
  of the customer's.

## The fix

One file (plus its mandatory byte-identical copy used by the webhook, and its
tests) — the question-to-field mapping only. No change to authentication, tenant
binding, duplicate protection, database schema, policies or any screen.

1. Ignore Tally's own envelope fields (event id, form id, form name, response
   id, submission links, timestamps) when matching answers, so the customer's
   name can never be taken from the form's name.
2. Recognise the live form's actual question wording, including its two
   spellings ("Moblie No", "Priorty"), for: name, mobile, boiler type, boiler
   age, boiler location, radiator count, bathroom count, simultaneous hot water,
   water pressure, cylinder/pump, priority, timeframe, preferred contact method.
3. Match photo answers by question wording as well as fixed names, so
   "Photos Current Boiler" is picked up.
4. Read the multi-choice extras answer ("new radiators, smart controls or power
   flushing") into the existing radiator / smart-control / flushing flags.

Matching stays value-guarded: a phone number is only accepted from a question
that reads like a phone question AND whose answer looks like a phone number, so
counts, dates and Eircodes can never be mistaken for one.

## Verification

- New unit tests built from the real question list of form 68qaMe, asserting
  every answer lands in its intended field and that "formName" is never read as
  the customer's name.
- Existing suite, the copy-in-sync check, type check and production build.
- A replay of the exact live submission shape against the deployed endpoint,
  then read back from the database: enquiry present under New Gas Boilers Dublin
  only, every answer populated, photos copied, office notified, and a repeat of
  the same submission reference returning the original enquiry.
- Confirm the two existing Cavan test enquiries are unaffected, and that the
  list, empty and error states still behave.

## Note on naming

The office screen for these is called **Boiler Enquiries** (list plus detail with
Call / WhatsApp / Request info / Create quote), reachable by office and admin
users only. There is no screen called "Unscheduled Sales Enquiries", and the main
dashboard does not yet show a count of new enquiries. Renaming it or adding a
dashboard tile is a separate change — say the word and I'll plan it.

## Files

- `src/lib/boilerEnquiryPayload.ts` — mapping and contact extraction.
- `supabase/functions/_shared/boilerEnquiryPayload.ts` — the webhook's
  byte-identical copy (enforced by an existing test).
- `src/lib/__tests__/boilerEnquiryPayload.test.ts` — tests for the live form.

Redeploy of `tally-boiler-enquiry` after the change; no migration.
