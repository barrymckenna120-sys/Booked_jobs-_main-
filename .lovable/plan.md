# Fix duplicate-phone matching for legacy numbers (BJ-0046 follow-up)

Scope: `src/components/jobs/NewJobPanel.tsx`, the duplicate check inside `handleNext` only (lines ~224–243). No other file, no DB change, no data cleanup.

## Problem

The check matches the exact normalised phone (`+353894436301`), so an existing row saved in an older format (`0894436301`) is invisible — this is how "mary white" got created alongside "Fred  White" on the same number today. Two secondary faults: `maybeSingle()` errors when several rows share a number (confirmed: 4 K&N rows on `+35314412618`), turning a real duplicate into a permanent "Couldn't check for duplicates" block; and only the Supabase `error` object is inspected, so a thrown/network rejection escapes uncaught.

## Changes

1. Match on the last 9 digits instead of the full string:
   - `const last9 = cleanPhone.replace(/\D/g, "").slice(-9);`
   - Query `.ilike("phone", `%${last9}`)` scoped to `organisation_id`, ordered by `created_at desc`, `.limit(1)`.
   - Guard: if `last9.length < 9`, skip the last-9 form and fall back to exact match on `cleanPhone` (defensive — `validatePhone` already ran, so this shouldn't trigger).
2. Replace `maybeSingle()` with array handling — take the first row of the `limit(1)` result. Multiple legacy matches now produce the normal duplicate warning, not a failed-check error.
3. Wrap the whole query in `try/catch`. Both a returned Supabase error and a thrown rejection set `dupeCheckError` and block progression; `setCheckingDupe(false)` moves into a `finally` so the button never sticks in "Checking…".
4. Gate the button: add `&& !dupeCheckError` to `canProceed` (line ~204) so a failed check visibly disables Continue until the phone is edited. `blurPhone` already clears `dupeCheckError`.

Behaviour on match is unchanged: inline warning naming the existing customer, progression blocked, user directed to search for them instead.

## Verification

- Unit test added to `src/lib/quickAddCustomer.test.ts`: last-9 extraction equivalence across `0894436301`, `+353894436301`, `353 89 443 6301`; and that a sub-9-digit input falls back rather than matching everything.
- Live check in the preview as K&N: quick-add a customer with `0894436301` and confirm it is blocked as a duplicate of `Fred  White` (the un-normalised row), reported with the row id it matched. Then confirm `+35314412618` shows a duplicate warning rather than "Couldn't check for duplicates".
- No test records left behind; nothing written if the check blocks.

Risk: Low — one function in one component, read-only query change.
