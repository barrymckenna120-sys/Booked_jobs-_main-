# Mobile-only validation + optional landline field (BJ-0046 follow-up)

## 1. Database

`customers` has `phone` (NOT NULL) and `whatsapp_phone` (nullable). There is **no** landline column — `whatsapp_phone` is only referenced by `handle-whatsapp-opt-out` and is not a landline store, so it must not be reused.

Migration: add nullable `landline_phone text` to `public.customers`. No grant/RLS change needed (existing table, existing policies cover it).

## 2. `validatePhone` — mobile prefix required

In `src/lib/customerValidation.ts`, tighten the check so that after stripping spaces and normalising `+353` / `353` / leading `0`, the remaining number must start with `83, 84, 85, 86, 87, 89` and be 9 digits total. Landline prefixes (01–07, 021, 065, …) are rejected. Error copy updated to say the field must be a mobile and to use the Landline field for landlines.

Purpose and signature unchanged; the primary Mobile Number field stays **required**.

### Known blast radius (must be handled, not ignored)

`validatePhone` is also used by `AddCustomerSheet.tsx` and `src/pages/CustomerDetail.tsx` (edit form, `blurField` + `validateAll`). Current K&N/Dublin data: 94 customers, 83 with a valid mobile prefix, **11 rows non-mobile** (four on `+35314412618`, three `065…`, plus `38…`, `01…`, `00…`, one blank-ish).

With a strict check, editing any of those 11 existing customers in `CustomerDetail` would become impossible — save is blocked on a field the user didn't touch. Handling: in `CustomerDetail` only, apply the mobile rule to the phone field **only when the user has changed it**; an untouched legacy value validates as before (Irish shape/length). New-customer paths (quick-add and `AddCustomerSheet`) are strict with no exemption.

## 3. Optional Landline field

Added below Mobile Number in both:
- `AddCustomerSheet.tsx` — new `landline_phone` in `EMPTY_FORM`, rendered via existing `CustomerFormField`, included in the insert and in the duplicate "update existing" path.
- `NewJobPanel.tsx` StepCustomer — new `landline` state, same styling as the other quick-add fields, passed through `handleNext`'s payload and written on customer creation.

Validation: sanity only — if non-empty, digits must be 7–15 after stripping non-digits; otherwise "Enter a valid phone number". Stored trimmed, or `null` when blank. Not part of `canProceed`, not part of the duplicate check, never normalised to `+353`.

## 4. Send paths — confirmed no changes needed

All WhatsApp/payment senders read `customers.phone` (or the job's copy of it). Nothing reads `whatsapp_phone` except the opt-out handler. `landline_phone` is purely informational and is never referenced by any send path, so `phone` remains the single mobile-of-record and no Edge Function changes are required.

## Verification

- Unit tests in `src/lib/quickAddCustomer.test.ts`: `083/085/086/087/089` accepted in `0…`, `+353…` and spaced forms; `01 441 2618`, `+35314412618`, `065…` rejected; landline sanity check accepts `014412618` and rejects `123`.
- Preview check as K&N: quick-add rejects a landline in Mobile Number, accepts it in Landline, and a created customer shows both values. Then open one of the 11 legacy non-mobile customers in Customer Detail and confirm an unrelated edit still saves.

Risk: Medium — validation is shared by three forms and legacy data does not satisfy the new rule; the touched-only exemption on the edit form is the mitigation.
