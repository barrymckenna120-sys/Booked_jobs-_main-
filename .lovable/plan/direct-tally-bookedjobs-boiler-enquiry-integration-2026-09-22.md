# Direct Tally → BookedJobs boiler enquiry integration

Connect the "Find My Boiler" form (Tally `68qaMe`) straight to the already-deployed
enquiry endpoint, with no Make.com in between.

## What production looks like today

- The endpoint `tally-boiler-enquiry` is deployed and live, and already refuses
  unauthenticated calls.
- A company was created earlier today named "N ew boilers Dublin" — owner login
  `sales@bookedjobs.ie`, phone 014412618. It already has a securely stored
  webhook password, but no form ID recorded against it.
- K&N Gas Services (both companies) and Cavan Gas keep their own separate
  passwords and form IDs. Nothing about them will be touched.

## Tally compatibility

Tally's own webhook setup supports custom HTTP headers alongside its optional
signing secret, so the required password header can be sent natively. No
fallback service is needed, no password goes in the URL, and authentication
stays on.

## Steps

1. **Correct the company in place** (no duplicate created):
   - Rename to "New Gas Boilers Dublin".
   - Set company phone to 086 232 2753.
   - Owner/admin user becomes Matt Murphy with email `info@newgasboilers.ie`,
     office/admin access only — no engineer record, so RGI 5307 is recorded as a
     company detail rather than an engineer licence.
   - Matt receives a password-set invitation email; no password is ever shown in
     chat.
2. **Register the form**: record form ID `68qaMe` against this company's Tally
   settings so the endpoint can recognise submissions from it even before the
   password is checked.
3. **Rotate to a fresh, unique webhook password** for this company only, stored
   encrypted. It is never printed, logged, or shown in chat; I hand it to you
   through the secure secret form so you can paste it into Tally.
4. **Confirm isolation and duplicate protection** by reading the data back:
   - The company's password and form ID differ from every other company's.
   - A submission carrying another company's ID is refused.
   - Repeating the same submission returns the existing enquiry instead of a
     second customer or enquiry.
5. **Give you the exact Tally setup values** to paste in: endpoint URL, header
   name, and where the password goes.
6. **Test submission** using a clearly fake customer only, then confirm the
   enquiry appears under Boiler Enquiries for this company and nowhere else.

## Technical detail

- Endpoint: `POST https://ktkfuquqxbrmuqrmbmdj.supabase.co/functions/v1/tally-boiler-enquiry`
- Auth header: `x-webhook-secret: <this company's webhook password>` (the alias
  `x-make-secret` is accepted for legacy Make scenarios). The header value is the
  raw password — no prefix, no signature scheme. No `Authorization` header is
  required.
- Tenant resolution stays server-side in `resolveMachineOrganisation`: the
  password resolves to exactly one company; the form ID is matched against
  `boiler_enquiry_form_id` on the company's `tally` integration row as a second
  independent binding. A body-supplied `organisation_id` is only ever accepted
  when it equals the server-derived company, and the `unbound_claim` fallback is
  not used by this function.
- Idempotency: unique partial index on
  `(organisation_id, external_source, external_submission_id)` plus an explicit
  pre-check; Tally's `data.submissionId` / `responseId` is the key. Tally retries
  (5 min → 1 day) therefore cannot create duplicates.
- Changes are data-only: a company row update, a profile/owner update, and the
  `tally` integration config for one company. No schema migration, no Edge
  Function code change, no RLS change.

## Known blockers to flag

- Tally's 10-second webhook timeout: submissions with several large photos are
  copied server-side and could approach it. If a timeout shows up in testing,
  Tally retries and idempotency prevent duplicates, but I'll report it rather
  than silently changing the photo flow.
- The form's actual field keys are unknown until a real submission arrives; the
  mapping uses tolerant label aliases. The first live test submission is what
  confirms every field lands in the right place.
