# Read-only audit: embeddable Fault Finder (facts only, nothing changed)

## 1. public-fault-lookup
a. Actions (handler.ts, GET only; OPTIONS for preflight):
- `models&brand=` (76-88) returns `[{id, brand, model_name}]`, sorted by model_name (logic.ts 45-50). A brand that isn't allowed returns `[]`.
- `codes&model_id=` (90-108) returns `[{code, category}]`, sorted fault → message → status, then by code (logic.ts 52-59).
- `lookup&model_id=&code=` (110-131) returns `{found:true, code, category, explanation, manual_url}` or `{found:false, manual_url}` (logic.ts 61-75).
- Any other action returns 400 `{error:"unknown_action"}`. Other errors: 400 invalid_brand / invalid_model_id / invalid_code, 403 origin_not_allowed, 405 method_not_allowed, 500 lookup_failed.
- Public brands are hardcoded: Ideal, Baxi, Glow-worm, Vaillant, Worcester Bosch (logic.ts 11).

b. Domain check: handler.ts 52-68 compares the exact Origin header against a list. The list comes from the backend setting `PUBLIC_FAULT_ALLOWED_ORIGINS`, a comma-separated value (index.ts 9-13). It isn't in the code or the database. Requests with no Origin header (curl) are allowed. `verify_jwt = false` (config.toml 166-167).

c. Rate limiting: not found. Responses are cached for 5 minutes (handler.ts 42).

d. It reads only `boiler_fault_models` and `boiler_fault_codes`. Responses are built from a fixed list of fields (logic.ts), so they can't include customers, jobs or organisation settings. Both tables have no `organisation_id` column.

e. Each code's type is stored in the data: `boiler_fault_codes.category`, checked to be `fault` / `status` / `message`, default `fault` (migrations 20260924194022 and 20260924194639).

f. Shared across all tenants. The fault code tables have no organisation tag.

## 2. Booking embed
a-e. Not found. No embed or iframe route is in the app routes, and there's no frame-ancestors, X-Frame-Options or CSP header set anywhere. No height-resize postMessage exists either; the only postMessage is the auto-generated preview login sync. Tenant bookings come in through Tally forms (for example `https://tally.so/r/68qaMe`) and the `tally-*` functions. `booking_links` holds per-customer token links, not a website embed.

## 3. Tenant settings
a. `organisations`: name, slug, company_phone, company_email, address, public_domain, owner_phone. `brand_settings`: colours and font_family, with no logo column. The logo storage path was not checked.

b. A public (signed-out) way to read these fields: not found. Existing public functions only cover quotes, receipts and certificates by token or number.

## 4. New Gas Boilers Dublin (59bb0688…)
a. `organisations.public_domain` is NULL. No website domain is stored. Company email is info@newgasboilers.ie.

b. Enquiries arrive through `tally-boiler-enquiry`. The Tally integration has form `68qaMe`, new_booking_url `https://tally.so/r/68qaMe` and secret `TALLY_WEBHOOK_SECRET_NEWGASBOILERS`.
- The organisation is decided by form ID and signature. An organisation_id sent with the form is only a hint and is rejected if it doesn't match (index.ts 108-187).
- Fields come from the field-key map in `_shared/tallyFormMaps.ts` (36-49): Property, Bedrooms, Radiators, Boiler type/age/location, Bathrooms, showers, pressure, cylinder/pump, Boiler working, Priority, Extras, timing, plus contact details.
- Any field not in the map is kept as label/value pairs in `other_answers` (tallyFormMaps.ts 120-124).
- `boiler_enquiries` has no brand, model or fault columns. So brand, model and fault code can be sent without a schema change, but only as free-text answers in notes, not as structured fields.

## Next step
Nothing to build yet. Approving this only confirms the audit. The widget design will be a separate plan.
