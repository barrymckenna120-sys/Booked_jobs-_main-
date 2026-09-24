# Booking intake: accept known variations of the phone field name

## What exists today
- **Boiler enquiries** (`tally-boiler-enquiry`) already do this. The phone is matched against a list of known names (`phone`, `mobile`, `mobile_number`, `moblie_no`, `mobile_no`, `telephone`, ...). If none match, it falls back to broader patterns (`phone`, `mob`, `tel`), and it only accepts an answer that actually looks like a phone number. This is why the 22/09/26 submission worked on the retry once the new spelling was added.
- **Booking intake** (`tally-incoming-job`) reads one exact key, `mobile_number`. If the key name changes (a renamed question or a different mapping upstream), the booking is rejected as "missing mobile_number".
- **Rebooking** (`tally-boiler-rebook`) reads one exact key, `phone`.
- In the booking intake, a number sent as `+353 87 ...` passes validation, because validation strips spaces first. But it is stored with the spaces kept, because the normalising step only strips spaces for numbers that don't start with `+`. The rebook intake already uses the shared normaliser correctly.

## Best practice for client form fields
1. **Prefer stable identifiers over labels.** Tally's question key/ID doesn't change when the question text is edited, so match on it first.
2. **Use a known-alias list as a fallback**, not open fuzzy matching. The list should be small, explicit and tested.
3. **Check the value, not just the name.** Only accept a field if its answer really looks like a phone number, so "Contact number preference" can't be picked up by mistake.
4. **Normalise before validating and storing**: strip spaces, dashes and brackets, then convert to +353 format with the shared normaliser.
5. **Fail loudly with the evidence**: when no phone field is found, log the field names received (never the answers), as the boiler intake does now.
6. **Never widen matching silently for other fields.** Scope this change to the phone field only.

## Change (one concern: the booking-intake phone field)
1. In `tally-incoming-job`, replace the single `body.mobile_number` read with:
   - The exact key `mobile_number` first. Current behaviour stays identical.
   - Then the alias list (`mobile_no`, `moblie_no`, `mobile`, `phone`, `phone_number`, `telephone`, `contact_number`).
   - Every candidate must pass the phone-shape check.
2. Store the number through the shared `normalisePhoneE164`. This fixes the case where numbers keep their spaces, and there is no change for numbers that were already clean.
3. On a missing phone, log the received field names only, so the next failure is diagnosable straight away.
4. Rebooking (`phone` key) is left untouched in this step. If you want the same treatment there, it will be a separate follow-up.

## Verification
- Unit tests for the alias picker:
  - Each alias resolves.
  - An alias whose value isn't a phone number is ignored.
  - `mobile_number` wins when several are present.
  - `+353 87 235 4257` is stored as `+353872354257`.
  - A missing phone gives the same rejection message as today.
- Deploy `tally-incoming-job` explicitly (Publish does not deploy it).
- Send scratch test posts to Cavan Gas only, using reserved scratch numbers:
  - one with `mobile_number`
  - one with `moblie_no`
  - one with a spaced number
  - one with no phone
- Read back the created jobs and customers with SQL, then delete the scratch rows.
- K&N and Dublin Gas are unaffected, because the exact-key path goes first and is unchanged.

## Out of scope
- Other booking fields, rebooking, and the legacy `tally-webhook`.
- Any change to authentication or organisation resolution.
- Any change to the wording of rejection messages.
