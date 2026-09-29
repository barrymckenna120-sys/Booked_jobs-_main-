# Zjq5rA lead: it exists and shows; photos are blocked by storage permissions

## Evidence (read-only, nothing changed)

**1. Did the retry return 200?** Yes in effect. A new lead row was created today at 13:00:32 UTC. Note: Tally's retry used a **new** submission ID `vX1dvXd` — `xV1lzgv` never got past the signature check (edge_function_logs shows `stage=invalid_signature` for it and the earlier retries). No success log line for vX1dvXd has reached the log table yet (logs lag), but the enquiry + photo rows below prove the request completed.

**2. The lead row exists** in `boiler_enquiries`:
- id `3be7735b-f182-4fc2-b87e-484e3c6a23f9`, organisation_id `c0aa41ac-41ab-42d8-8085-972c072b0279` (test org only)
- status `QUOTED` (a quote has already been made from it), source `kn-website-new-boiler`, enquiry_type `new_boiler`, contact barry / +353872354257

**3. Page/route:** Pipeline → Leads renders the same `BoilerEnquiries` component as `/boiler-enquiries` (`src/pages/Pipeline.tsx:5,81`). Its query is `from("boiler_enquiries").select("*, customers(...)")` with **no status/source/type filter** — only org scoping via RLS (`src/pages/BoilerEnquiries.tsx:94-97`). So this lead **does** appear in Pipeline → Leads for anyone signed into the test org. (You are currently on its detail page: `/boiler-enquiries/3be7735b-...`.)

**4. Photos — root cause found.** One `job_media` row exists: bucket `job-media`, path `c0aa41ac.../boiler-enquiries/3be7735b.../ced2b3cd....png`, `boiler_enquiry_id` set, `public_url` null. The detail page queries by `boiler_enquiry_id` (`BoilerEnquiryDetail.tsx:92-94`) and builds signed links via `createSignedUrls` on `job-media` (`src/lib/mediaUrl.ts:57-58`). **But** the storage read policy `job_media_select_own_org` on `storage.objects` only allows paths where the **second folder segment is a customer id** (`(storage.foldername(name))[2]` → customers). Enquiry photos are stored at `<org>/boiler-enquiries/<enquiry>/...`, so segment 2 is the literal text `boiler-enquiries` — the policy never matches, the signed URL is refused, and the photo can't render.

**5. 68qaMe leads:** same table, same page, same photo code path — they show as leads because the list query is unaffected; their photos have the same storage-policy problem.

## Proposed smallest fix (one migration, no code changes)

Add one SELECT policy on `storage.objects` for bucket `job-media` allowing org members to read paths whose **first** folder segment is their organisation id and whose second segment is `boiler-enquiries`:

```sql
create policy job_media_select_enquiry_photos
on storage.objects for select to authenticated
using (
  bucket_id = 'job-media'
  and (storage.foldername(name))[1] = get_my_org_id()::text
  and (storage.foldername(name))[2] = 'boiler-enquiries'
);
```

- Read-only for org members; no write/delete change; no other bucket or path affected.
- Verified against 68qaMe enquiry photos too (same path pattern), so both forms' photos start rendering.
- After applying: reload the lead detail page and confirm the photo appears; check a 68qaMe lead's photo as the second-tenant check.

Awaiting approval before applying the migration.
