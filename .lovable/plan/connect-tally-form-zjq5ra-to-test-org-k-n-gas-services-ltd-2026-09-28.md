# Connect Tally form Zjq5rA to TEST org "K&N gas services Ltd"

Confirmed target: `c0aa41ac-41ab-42d8-8085-972c072b0279` — "K&N gas services Ltd". Real K&N (`8c37827f…`) is not touched.

## Where it lives
- Function: existing `tally-boiler-enquiry` (same one New Gas Boilers Dublin / form 68qaMe uses). No new function or table.
- Table: `boiler_enquiries` (photos in `job_media` + `job-media` storage, org-scoped path).
- Page: office sees it at **Boiler Enquiries** (`/boiler-enquiries`, detail `/boiler-enquiries/:id`), signed in to the test org.

## Steps (each separately reviewed)
1. **Data write (own step):** add `boiler_enquiry_form_id: "Zjq5rA"` to the test org's `tally` row in `tenant_integrations` (create the row if it has none — it currently has no `tally` row). Read back, and confirm Zjq5rA isn't bound to any other org.
2. **Signature check:** verify `tally-signature` = base64 HMAC-SHA256 of the raw body using backend secret `TALLY_SIGNING_SECRET_KN_TEST` (per-form secret name looked up from the integration row, not hardcoded org). Missing/invalid → 401, logged. Constant-time compare. Existing 68qaMe path keeps its current auth until its own secret is configured (no regression).
3. **Org resolution:** form ID → org only; payload `organisation_id` ignored/rejected on conflict (already so). Unknown form ID → 400 + log (currently returns a denial; will align status to 400).
4. **Mapping by Tally field key** for Zjq5rA (keys captured from a real test submission's payload, stored in a small per-form map in the function):
   - Contact details → `contact_name`; "Moblie number" → `contact_phone` (stored exactly as captured; "Mobile no" heading ignored); Email → `contact_email`; Eircode → `eircode`; address → `address`; Preferred contact → `preferred_contact_method`
   - `source = "kn-website-new-boiler"`, `enquiry_type = "Boiler Replacement"`
   - Survey answers → readable list in `office_review_notes`, in your order: Property, Bedrooms, Radiators, Boiler type, Boiler age, Boiler location, Bathrooms, 2 showers at once, Water pressure, Cylinder/pump, Boiler working, Priority, Extras, When to complete. Also fill matching structured columns where they exist.
   - Photos current boiler → existing validated photo upload to `job_media`; original Tally URL(s) kept in the notes/raw payload.
5. **Never drop a lead:** unknown/renamed fields appended to notes under "Other answers"; full payload always kept in `raw_payload`. Only hard reject: no name AND no phone AND no email (existing rule — confirm you're happy with that).
6. **Idempotency:** unchanged existing guard (unique `organisation_id + external_source + external_submission_id`, 23505 fallback) — duplicate returns 200 with the existing lead.
7. **Tests (Deno):** valid submission, bad signature, missing signature, unknown form ID, duplicate submission, missing optional fields, renamed field lands in notes. Then deploy the function (with your approval) and send one test submission to the test org, reading back the row.

## You will get
- Webhook URL: `https://ktkfuquqxbrmuqrmbmdj.supabase.co/functions/v1/tally-boiler-enquiry`
- Tally steps: Form Zjq5rA → Integrations → Webhooks → Connect → paste URL → set "Signing secret" to a strong random value (e.g. from a password manager) → save; then paste that same value into the secure secret form I'll open for `TALLY_SIGNING_SECRET_KN_TEST`.

## Technical notes
- Signature helper in `_shared/` so other Tally intakes can adopt it later; not wired into them now.
- No change to K&N `8c37827f`, 68qaMe behaviour, RLS, or other tenants; multi-tenant check: 68qaMe regression test still passes.
