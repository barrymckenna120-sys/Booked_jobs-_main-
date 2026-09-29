# Read-only report: how booking-form photos reach Cloudinary (nothing changed)

1. **Function / helper.** Only `tally-incoming-job/index.ts` uploads to Cloudinary. There is **no shared helper**: the upload is written inline (lines 637–840). `mediaUrls.ts` only turns the Tally answer into a list of URLs (`collectMediaUrls`, used at index.ts:686). `tally-webhook` is retired (returns 410) and uploads nothing.
2. **Method.** An **unsigned upload preset** is sent straight to the upload URL, with no API key or signature: index.ts:781 (`upload_preset`) and 785–787 (`POST https://api.cloudinary.com/v1_1/<cloud>/auto/upload`). The preset name comes from the secret `CLOUDINARY_TALLY_UPLOAD_PRESET` (index.ts:19). Its value can't be seen from here. If it is missing, the photo is skipped and logged (707–710).
3. **Folders.** `tally-uploads/<organisation_id>/<job_id>` (index.ts:782), tagged `org:<id>,job:<id>,source:tally` (783). So yes, photos are filed by organisation. With an unsigned preset, though, Cloudinary only uses the folder the caller asks for if the preset lets it.
4. **Delivery.** Public. The row keeps `secure_url` as `public_url` (822). App screens show Cloudinary items by passing that public link through unchanged (`src/lib/mediaUrl.ts:6,12-13,23`), while photos kept in our own storage get links that expire after 1 hour (`MediaGallery.tsx:45-49`).
5. **Recorded in** `job_media` (813–824) with `organisation_id: orgData.id` set, plus `job_id`, `customer_id`, `storage_bucket: "cloudinary"`, `storage_path = public_id`, `uploaded_by: "customer"`.
6. **Secret names.** `CLOUDINARY_CLOUD_NAME` (falls back to the hardcoded name `ddx2gnklt` if unset, index.ts:18) and `CLOUDINARY_TALLY_UPLOAD_PRESET` (19). No Cloudinary API key or secret is used anywhere.
7. **Zjq5rA today.** `tally-boiler-enquiry/index.ts:392-442` downloads each photo, checks its type and size, and stores it in our own **private** storage bucket (`BUCKET`) at `<org>/boiler-enquiries/<enquiry_id>/<uuid>.<ext>` (417). It records a `job_media` row with `organisation_id` and `boiler_enquiry_id` (428–437). It does not use Cloudinary.
   **To use the same pattern:** first move the upload code out of index.ts:779–811 into a shared helper, then call it from `tally-boiler-enquiry` with folder `orgs/<org>/leads/<lead_id>`. Store the result as `storage_bucket: "cloudinary"` and `public_url`, and keep `boiler_enquiry_id`. Note that this would make lead photos **less** private than they are today (public links instead of private storage).

## Weak points in the booking form (flagged, not fixed)
- Unsigned preset: anyone who learns the preset name and cloud name can upload to the account.
- The photo links are public and never expire. Anyone who has a link can see a customer's photo, with no login.
- The cloud name has a hardcoded fallback (index.ts:18).
- The organisation folder is only requested by the caller, not enforced.
- The upload code is not shared, so a second copy would drift.
- Files up to 25MB are read fully into memory (739–750).
