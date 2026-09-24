# Fix rebooking phone conversion (tally-boiler-rebook)

## Problem
`tally-boiler-rebook` normalises the incoming phone with the shared Irish-only helper (`_shared/phone.ts` → `normalisePhoneE164`). That helper assumes any leading-zero number is Irish, so a Moroccan mobile typed as `0656802656` becomes `+353656802656` and the customer match fails (or worse, could collide with an Irish number). The booking-intake function (`tally-incoming-job`) already solves this with `normaliseIntakePhone` / `isValidIntakePhone` in `phoneField.ts`, which validate against real country codes via `libphonenumber-js`.

## Change (2 files, no behaviour change anywhere else)

1. **`supabase/functions/_shared/phone.ts`** — additively add the two intake functions (`normaliseIntakePhone`, `isValidIntakePhone`, plus the `libphonenumber-js` import and legacy-Irish regex), copied byte-for-byte from `tally-incoming-job/phoneField.ts`. Nothing existing in this file is modified; `normalisePhoneE164`, `samePhone`, `last9Digits`, `toE164Digits` stay exactly as they are (other functions depend on them).

2. **`supabase/functions/tally-boiler-rebook/index.ts`** — replace the single normalisation call:
   - `normalisePhoneE164(phone)` → `normaliseIntakePhone(phone)`
   - Add a validity gate with `isValidIntakePhone(phone)` before matching; invalid numbers keep the existing `bad_request_invalid_phone` log + "Invalid phone" 400 response.
   - No other logic changes: customer matching (exact → email fallback), job creation, fingerprint guard, notifications all untouched.

3. **`supabase/functions/tally-incoming-job/phoneField.ts`** — left as-is (it keeps its own copy; no risk of regressing the working booking intake).

## Behaviour after fix
- `0656802656` → still treated as Irish local → `+353656802656` (unchanged: a bare leading-zero number is genuinely ambiguous and Irish-default is the documented legacy behaviour).
- `+212656802656`, `00212656802656`, `212656802656` (with a real country code) → correctly kept as `+212…` instead of being forced to `+353`.
- Genuinely invalid numbers (bad country code, wrong digit count) → rejected with the existing "Invalid phone" 400 instead of being mangled into a fake Irish number.

## Verification
- Diff of both files shown before deploying.
- Run the existing Edge Function tests; add rebook-side tests mirroring the intake ones (+212, 00212, Irish local, invalid).
- Deploy only `tally-boiler-rebook`.
- Live check: unauthenticated request still returns 401; no real customer data touched.

## Explicitly out of scope
- No changes to `tally-incoming-job`, `_shared/whatsapp.ts`, customer matching, or any other function.
- No data changes to existing customer rows.
