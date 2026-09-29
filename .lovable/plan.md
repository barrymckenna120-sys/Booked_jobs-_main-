# Zjq5rA iPhone photo: findings and proposed fix

## Findings (read-only)
1. **Latest Zjq5rA lead:** `cb784c77-e443-45da-9b75-1903854cbe59`, created 29/09/26 13:22:45 UTC, submission `xV1lzgv`, test org `c0aa41ac`, status NEW, source `kn-website-new-boiler`, type `new_boiler`, name and phone present. No newer Zjq5rA row exists. The function has no logs left for today, so if you sent a later iPhone submission it never reached us (check Tally's event log for it).
2. **Photo on that lead:** key `question_GB7Jgp` (unchanged), `image/png`, `.png`, 34,746 bytes (a screenshot, not a camera photo). It **was stored**: one `job_media` row, bucket `job-media`, path `c0aa41ac…/boiler-enquiries/cb784c77…/f3e49e50….png`, 13:23:50 UTC. Nothing was rejected. So "photo didn't come through" is either a later submission not arriving, or the photo not showing on the lead page. Unconfirmed which.
3. **Field keys:** all 21 keys in the payload match the mapping. No renamed or new keys. Some labels changed but the mapping uses keys, so no impact.
4. **Multiple choice:** Property, Bedrooms, Boiler type, Boiler working and Priority are now multiple choice. Notes show text ("Apartment", "1", "Gas", "yes", "Lower Price"), not IDs.

## Current photo rules
- Allowed types already include `image/heic` and `image/heif`, but they are stored as-is and won't display in Chrome/Android/desktop.
- Limit 15 MB per photo, up to 10 photos: covers typical 3–8 MB iPhone photos.
- A rejected photo does not block the lead, but the reason is only in the function response, not visible to the office.

## Proposed steps (each separately approved)
1. **Confirm the gap:** open lead `cb784c77` signed in to the test org and screenshot the photo; ask you for the Tally event ID of the iPhone submission if it isn't this one.
2. **HEIC to JPEG:** when a photo is HEIC/HEIF, convert it to JPEG before saving and store only the JPEG (simpler, displays everywhere). If conversion fails, treat as rejected (step 3). Needs a server-side image library; I'll confirm one works in the backend runtime before building, and stop if none does.
3. **Visible note when a photo fails:** lead is still created; add "Photo couldn't be processed. Ask the customer to WhatsApp it." to the lead notes, shown on the lead page. The failure reason (e.g. too large) logged without personal data.
4. **Mapping:** no change needed; keys are unchanged.
5. **Tests:** HEIC converted to JPEG, PNG/JPEG unchanged, too-large photo gives note plus lead, multiple photos, 68qaMe unchanged. Then deploy with your approval and one iPhone test.

## Technical notes
- Files: `tally-boiler-enquiry/index.ts` (photo loop ~392–445), `_shared/boilerEnquiryPayload.ts` (types/limits), notes display on the lead detail page.
- Applies to 68qaMe too, since it shares the loop; verify both tenants.
