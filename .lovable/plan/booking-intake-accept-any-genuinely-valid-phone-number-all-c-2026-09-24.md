# Booking intake: accept any genuinely valid phone number (all companies)

## Why
The shared booking intake rejected `+212656802656` because its check only accepts numbers starting with `+353` or `0`. A customer living in Ireland can legitimately have a foreign number, so the check should ask "is this a real phone number?" rather than "is this Irish?". This change is in the shared intake, so it applies to every company's live form.

## Change (one concern: phone validation in `tally-incoming-job`)
1. **Clean the number first.** Strip spaces, dashes, dots and brackets, then:
   - `+CC...` stays as it is.
   - `00CC...` becomes `+CC...`. This is new: today `00212...` would wrongly become `+35300212...`.
   - `353...` becomes `+353...`.
   - A leading `0` (or no prefix) is treated as an Irish local number and becomes `+353...`, same as today.
2. **Validate for real.** Use the standard phone-number library (`libphonenumber-js`, the metadata build Google's rules are based on) to check the result is a valid number for its country: a real country code and a correct digit count for that country. Anything that isn't a plausible number is still rejected.
3. **Store the cleaned E.164 value** (for example `+212656802656` or `+353872354257`). Every Irish number that is accepted today is stored exactly as it is today.
4. **Keep the rejection wording** "Invalid mobile number format" and the 400 status unchanged.
5. **Unchanged:** the field-name aliases from earlier today, authentication, company resolution, the double-booking guard, and all other fields.

## Scope note
The shared `normalisePhoneE164` helper is used by other functions (for example rebooking). To keep this a single concern, the `00` handling and the validity check live in the booking intake's own phone helper. The shared helper is untouched, so other functions don't change behaviour in this step.

## Verification
- Unit tests:
  - These are accepted: `+212656802656`, `00212656802656`, `+44 7911 123456`, `087 235 4257`, `+353872354257`, `353872354257`.
  - These are rejected: `+212123`, `+999123456789` (invalid country code), `12345`, `abc`, and an over-long number.
  - Every Irish format accepted today still gives the same stored value.
- Run the existing intake tests. Deploy `tally-incoming-job` explicitly.
- After deploying, check live that a request without a company secret is still refused.
- The end-to-end booking check happens on your next real test submission. I'll read back the job and customer, including the stored phone, for whichever company it was sent to.

## Double-booking guard (read-only watch, no changes)
Next time you ask, I'll check Tally bookings for every company since 16/09/26 19:00 for any repeat job for the same customer within 5 minutes, and report the counts per company.

## Known side effect (accepted)
Automatic WhatsApp messages (confirmations, reminders) will now go to foreign numbers when a customer gives one.
