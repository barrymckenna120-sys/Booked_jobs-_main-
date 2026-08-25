# OWASP Security Audit — Read-Only (Static + Read-Only Live Probes)

Audit only. No application code, RLS policy, grant, edge function, storage, auth, config, or payment change. No remediation, no deployment. The single file created is the report itself.

## Authorization boundaries (as confirmed)

- Live probes limited to **read-only**: anonymous-key reads against protected tables, and unauthenticated calls to edge functions to check they reject with 401/403.
- **No new test data.** Existing scratch/test records only (the ZZ Scratch contact and its cancelled jobs). Nothing created, nothing deleted, so the test-data creation/cleanup log will record "none created".
- Payments: **mock only.** No forged or replayed events are posted to any live webhook URL. Payment replay, signature-bypass, and duplicate-refund checks are assessed statically plus against local logic only.
- Notifications: no message-sending function is invoked with a valid payload. Unauthenticated probes are made only against functions where a rejection happens before any business action, and each probe is followed by a check that no `message_log` row was written.

## Phase 1 — Static inspection

Read-only metadata and source review across:

1. **Database** — all 52 public tables plus views: RLS enablement, every policy expression, table grants per role (`anon`, `authenticated`, `service_role`), the 49 database functions (security definer vs invoker, `search_path`), and all triggers. Special attention to the tenant boundary function `get_my_org_id()` and the impersonation path (`verify_impersonation_token`, `bootstrap_impersonation_hmac`).
2. **Edge functions** — all 84 functions in `supabase/functions/`, plus `_shared/`. Per function: JWT verification setting in `config.toml`, auth guard presence, org/ownership validation, input validation, CORS, service-role usage, secret handling, idempotency and replay resistance, error/data exposure, third-party calls.
3. **Storage** — the 5 buckets (`business-logos` and `email-assets` public; `job-media`, `certificates`, `quote-pdfs` private): object policies, ownership enforcement, signed-URL TTLs, path handling.
4. **Auth** — registration/signup disablement, login lockout, password reset, session refresh and revocation, role assignment and escalation guards, public route allowlist in `useAuth.tsx` and `App.tsx`.
5. **Admin actions** — superadmin/office gating server-side vs client-side only, tenant provisioning and status changes, impersonation.
6. **Payments** — SumUp checkout creation, webhook signature verification, dedup layers, `job_payments` append-only design, server-side amount derivation, per-tenant credential resolution.
7. **Secrets** — env var usage across functions; verify nothing is logged, echoed, or returned.

Also run the Supabase database linter and record its output as corroborating evidence.

## Phase 2 — Read-only live probes

Each probe recorded with Test ID, timestamp, role, target, expected vs actual, HTTP status, redacted request/response, and the source file or policy it exercises.

- **Anonymous reads**: with the publishable key only, attempt `SELECT` against every table expected to be protected — customers, service_calls, invoices, job_payments, quotes, certificates, profiles, engineers, tenant_integrations, settings, organisations, audit_log, and the rest. Expect empty result or permission error; any returned row is a P0.
- **Anonymous RPC reads**: call the public-by-design RPCs (`get_quote_by_token`, `get_receipt_public`, `get_cert_pdf`, `get_booking_link_by_token`) with invalid tokens and confirm they leak nothing; call the internal ones (`get_my_org_id`, `get_org_profile_directory`, `verify_impersonation_token`) anonymously and confirm rejection.
- **Unauthenticated edge-function calls**: no auth header, empty or invalid body, against every function. Expect 401/403. Record any function that returns 200 or performs work. Sensitive-side-effect functions are probed with a deliberately non-existent ID so a missing guard cannot touch real records, and each is followed by a `message_log` / `job_payments` check to prove nothing fired.
- **Storage read checks**: anonymous fetch of an object path in each private bucket; confirm 400/403. Confirm public buckets expose only branding assets.
- **Signed-URL behaviour**: inspect TTL and confirm a URL cannot be widened by path manipulation, using an existing test-owned media path.

Anything requiring an authenticated session, a second tenant, cross-tenant writes, object-ID substitution, forged webhook delivery, or session/token-revocation testing is marked **Not Executed — Authorization or Safety Constraint**, with the reason and the retest procedure recorded.

## Deliverable

`docs/security-audit-2026-08-25.md`, containing: executive summary, scope and authorization boundaries, methodology, static coverage, live-probe coverage, findings summary table, detailed findings (Finding ID, title, severity, status, OWASP category, CWE, CVSS estimate, affected component, static evidence, live evidence, safe repro, business and technical impact, remediation, retest), full table-by-table RLS matrix, full edge-function matrix, storage-bucket matrix, auth review, admin-action review, payment/webhook review, business-logic abuse cases, test-data log (none created), limitations and unexecuted tests, prioritized remediation plan, retesting checklist.

No secrets, tokens, keys, cookies, personal data, or full payment details appear in the report. Known real-customer data encountered during probing is redacted.
