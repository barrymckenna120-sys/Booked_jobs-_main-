# Rebook: trust the incoming phone number (no rewriting)

## What I found in the code

- `tally-boiler-rebook/index.ts` line 144 calls `normalisePhoneE164` (from `_shared/phone.ts`), which turns any leading-zero number into `+353…`. That's what converted `0656802656` → `353656802656`.
- Customer matching goes through `_shared/matchCustomer.ts`. Important: **the matcher re-normalises internally for comparison only** (exact match on normalised phone, then a country-code-aware digit fallback, then email). It never writes anything — so passing a raw phone in does not corrupt stored data.

## The matching question you asked me to flag

Yes, there is a real consideration here, and it's manageable:

- **If Make sends a proper international number** (`+212656802656` or `00212656802656`): the matcher's internal normalisation keeps it as `+212…`, and it matches the stored `+212…` customer exactly. Works.
- **If Make ever sends a bare local number** (`0871234567`): the matcher assumes Irish, exactly as the whole system always has. Works for Irish customers.
- **The only broken case** is a bare number with a dropped leading zero and no country code (`0656802656` meaning Morocco) — but that case is broken *today* too, and your upstream Make formatting is precisely what eliminates it. No code change can rescue a number that arrives with no country code; the fix is Make sending `+CC`, which is your plan.

So: removing normalisation from rebook is safe **provided Make always sends `+CC…` (or `00CC…`)**. I'll note this as a requirement on the Make side.

## The change (1 file only: `supabase/functions/tally-boiler-rebook/index.ts`)

1. Remove the `normalisePhoneE164` import and the `normalisePhone(phone)` call.
2. Replace with a light sanity check: trim the phone, strip spaces/dashes/brackets, require 7–15 digits with an optional leading `+`. Empty, missing, or non-phone-shaped → same existing `bad_request_invalid_phone` log + `400 "Invalid phone"` response. No country assumption, no prefix rewriting.
3. The cleaned-but-unrewritten phone is passed to `matchCustomer` and stored on the job exactly as received (e.g. `+212656802656` stays `+212656802656`).
4. Nothing else changes: secret check, organisation resolution, submission-id and fingerprint duplicate guards, job creation, renewal-stage update, notifications, email fallback — all untouched.
5. `_shared/phone.ts`, `_shared/matchCustomer.ts`, and `tally-incoming-job` are **not modified**.

## Verification

- Show you the full diff before deploying.
- Add rebook-side tests: `+212…` kept as-is and matched, `00353…` kept, Irish local `087…` still matches via the matcher, empty/garbage rejected with 400.
- Run Edge Function tests; deploy only `tally-boiler-rebook`.
- Live check: unauthenticated request still returns 401; no customer data touched.

## Out of scope

- No changes to any other function, shared helper, or stored data.
- Make-side formatting (sending `+CC…`) is your separate step.
