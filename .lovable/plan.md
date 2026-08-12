# Lock down organisation_id on cancel-job-notify and generate-accountant-export

Both functions currently accept `organisation_id` from the request body. Both are called only from authenticated pages (confirmed in the previous audit: `JobDetail.tsx:439`, `EngineerJobDetail.tsx:312`, `SalesLedger.tsx:520` — no cron entry, no external caller). So the org can be derived server-side with no caller left behind.

Branch note: the workspace is on `edit/edt-010f9abd-8d64-4fb3-8217-369f5ebf0ff5`, not `dev`. Per your answer, work proceeds here and you merge the edit branch into `dev` afterwards.

Verified precondition: `public.get_my_org_id()` is `SECURITY DEFINER` and `EXECUTE` is granted to `authenticated` (and `service_role`), with `anon` revoked — so calling it with the caller's JWT works from both functions.

## 1. supabase/config.toml

- `[functions.cancel-job-notify]` (line 82): `verify_jwt = false` → `true`
- `[functions.generate-accountant-export]` (line 66): `verify_jwt = false` → `true`

Gateway-level JWT verification is belt-and-braces; each function still validates the token in code, because the org must come from the verified user either way.

## 2. supabase/functions/cancel-job-notify/index.ts

- Drop `organisation_id` from the destructured body — body becomes `{ service_call_id, cancellation_reason }`.
- Add the standard auth preamble used by `deactivate-user`: require `Authorization: Bearer …`, resolve the caller with an anon client `auth.getUser(token)`, return 401 when absent or invalid.
- Replace `const orgId = organisation_id || sc.organisation_id` with an org resolved from the caller: call `get_my_org_id()` on a client carrying the caller's Authorization header, and use that as `orgId`. If it returns null, 403.
- Add a tenant-isolation check that did not exist before: if the caller's org does not match `service_calls.organisation_id` for the requested job, return 403 instead of sending a WhatsApp on another tenant's behalf. (Previously a caller could pass any `organisation_id` and drive the credential lookup with it.)
- Everything else stays byte-for-byte: `SKIP_REASONS` short-circuit, `extractFirstName`, `formatPhone360`, the branding lookup, the message text and rebook line, the 360Messenger call, `whatsapp_messages` insert, and both `logMessage` calls.

## 3. supabase/functions/generate-accountant-export/index.ts

- Same auth preamble; 401 on a missing or invalid token.
- Resolve `callerOrgId` from `get_my_org_id()` once, near the top, and `callerUserId` from the verified token.
- Remove every read of `body.organisation_id` — three sites:
  - line 74 (accountant-email fallback condition) → gated on `callerOrgId`
  - line 103-104 (`query.eq("organisation_id", …)`) → always filters on `callerOrgId`, no longer conditional, so the export can never span tenants
  - line 210 (`let orgId = body.organisation_id || null`) → `callerOrgId`
- Also stop trusting `body.user_id`: the settings lookup at line 66 and the profile fallback at line 211 use the verified `callerUserId` instead. `SalesLedger.tsx` never sends `user_id`, so this is a strict improvement, not a behaviour change for the live caller.
- Untouched: `getMonthRange` / month handling, `deriveStatus`, `paidJobsInPeriod` / `collectedAmount` / `revenueDate`, the VAT-at-13.5% maths, the HTML table, base64 encoding, subject line, and the Resend send.

## 4. Frontend call sites

- `src/pages/JobDetail.tsx:439-445` — remove the `organisation_id: (job as any).organisation_id` line from the body.
- `src/pages/engineer/EngineerJobDetail.tsx:312-318` — same removal.
- `src/pages/SalesLedger.tsx:520` — unchanged; it already sends only `{ month }`.

No other function, config block, or file is touched.

## Verification

- `tsgo` typecheck plus the existing Deno tests under `supabase/functions/_shared/`.
- Read back the two `config.toml` blocks and grep both function sources for `body.organisation_id` / `organisation_id` in the destructure to confirm zero remaining hits.
- Manual check to run after merge: cancel a job in the office view and in engineer mode (WhatsApp still sends, `message_log` still records `cancel_job_notify`), and send an accountant export for last month from Finance → Sales Ledger.

## Risk

Medium, not low. `cancel-job-notify` gains a 403 path it never had, so a user whose `profiles.organisation_id` is unset or mismatched against the job would stop receiving cancellation notices where they previously succeeded. Worth a quick query on profiles with a null `organisation_id` before merging; flag if you want that added as a pre-step.
