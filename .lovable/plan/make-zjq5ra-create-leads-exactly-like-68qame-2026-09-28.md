# Make Zjq5rA create leads exactly like 68qaMe

## How 68qaMe works today (read-only evidence)
- **Function:** `tally-boiler-enquiry` (same one Zjq5rA already hits).
- **Org resolution:** unsigned path, `resolveMachineOrganisation` — company webhook password + form ID matched to `boiler_enquiry_form_id` on that company's Tally settings (`index.ts:155-172`). 68qaMe → New Gas Boilers Dublin.
- **Lead table:** `boiler_enquiries` (insert `index.ts:322-345`), status `NEW`, `external_source="tally"`, `external_submission_id` = Tally submission id.
- **Page:** Boiler Enquiries, list `/boiler-enquiries`, detail `/boiler-enquiries/:id` (`src/App.tsx:454,462`).
- **Job type:** `enquiry_type = "new_boiler"` (`index.ts:327` default). Source: not set (null).
- **Field mapping:** label-alias based via `extractContact` / `mapBoilerEnquiryFields` / `extractAttribution` (`_shared/boilerEnquiryPayload.ts:382, 211, 422`). Unknown answers stay only in `raw_payload`.
- **Customer:** match by phone then email; blank fields filled, differences noted, never overwritten (`index.ts:260-319`).
- **Photos:** copied into tenant-scoped storage + `job_media` rows.
- **Notifications:** one `customer_activity` "New boiler enquiry received" + one office notification "New boiler enquiry" per admin/office/owner/manager (`index.ts:435-470`).
- **Latest 68qaMe lead:** `0b54ca3e…` (23/09/26 09:17 UTC), New Gas Boilers Dublin, submission `laZ4LXp`, type `new_boiler`, source null, status NEW, name/phone/Eircode present, 1 notification, 1 photo.

## What Zjq5rA does today vs 68qaMe
Everything is already shared (same function, table, page, customer matching, photos, activity, notification). Only differences:
1. Job type is `"Boiler Replacement"` — 68qaMe uses `"new_boiler"`. **Change to `new_boiler`.**
2. Source `"kn-website-new-boiler"` — keep (so Nicole can tell the sites apart).
3. Survey notes list + "Other answers" + photo URLs in notes — keep (68qaMe has no notes; this is additive).
4. Signature check + submission-id idempotency — keep.
5. Temporary field-capture logging — already removed in the last deploy; I'll re-confirm no key/label logging remains.

## Steps
1. **Code (one line + test):** in `_shared/tallyFormMaps.ts` set Zjq5rA `enquiryType: "new_boiler"`; update the test expectation. 68qaMe path untouched (it never uses the form map).
2. Run Deno tests + typecheck, deploy `tally-boiler-enquiry` (with your approval).
3. You send one test (or resend) from Zjq5rA → I read back the lead in test org `c0aa41ac`: type, source, contact fields, notes, photos, 1 activity + notifications. Also confirm the latest 68qaMe lead/behaviour unchanged.
4. **After you confirm:** separate data-only step — move `boiler_enquiry_form_id: "Zjq5rA"` + signing-secret name from the test org's Tally row to real K&N `8c37827f` (create the row there if missing, remove from test org), read back that Zjq5rA is bound to exactly one org.

## Open blocker
The signature still fails on real submissions (secret mismatch). Step 3 can't pass until the Tally "Signing secret" and the saved secret are the same value — I'll open the secure form again once you've pasted a fresh value into Tally.
