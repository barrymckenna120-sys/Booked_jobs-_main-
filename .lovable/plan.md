## Fresh certificate generation test — Dublin Gas (throwaway data)

Live-fire test that the deployed `generate-certificate-pdf` writes to the new org-scoped storage path end-to-end. Uses a throwaway customer + job on the Dublin Gas org so no real record is touched. Test cert row will be left in place.

### Steps

1. **Create throwaway test data on Dublin Gas org**
   - Resolve `organisation_id` for slug `dublin-gas`.
   - Insert a `customers` row (e.g. name `ZZ Stage2 Test`, dummy phone/address).
   - Insert a `service_calls` row against that customer (status `Completed`, job_type appropriate for a cert). Capture `job_id`, `organisation_id`, `customer_id`.

2. **Invoke `generate-certificate-pdf` fresh**
   - Read `supabase/functions/generate-certificate-pdf/index.ts` to confirm the current request payload shape.
   - Call via `supabase--curl_edge_functions` with valid cert fields.
   - Expect 200 with `{ cert_number, pdf_url, access_token }` (or equivalent).

3. **Verify storage object path**
   - Read the new `certificates` row: confirm `pdf_url` starts with `<organisation_id>/` (not a bare filename).
   - Round-trip via `resolve-document-link` to confirm the object physically exists at that org-scoped path.

4. **Verify token link end-to-end**
   - `POST /resolve-document-link` with the new `access_token` → expect 200 + signed URL.
   - `curl` the signed URL → expect HTTP 200, `application/pdf`, `%PDF` magic bytes.

5. **Report back**
   - Test cert number, org_id-prefixed object path, resolver status, PDF byte count.
   - If any step fails: exact failure surface (function log excerpt + DB row), no attempted fix in this pass.

### Non-goals
- No code changes.
- No bucket privacy flip.
- No backfill.
- No cleanup of the throwaway customer / job / cert row — you'll decide later.
