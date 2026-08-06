# OWASP security review of BookedJobs

Your brief described building a jobs marketplace from scratch. This project is already a live multi-tenant field-service platform serving real tenants on two custom domains, so the useful work is a rigorous security review of what exists — not a rebuild. I am treating the brief as the review standard and mapping its requirements onto the app's actual model.

Decisions made on your behalf (you skipped the scoping questions):

- **No rewrite, and no new customer/worker logins.** Adding self-service customer and worker accounts would be a large new product, not a security fix. If you want it later it's a separate plan.
- **Full report**, every section your brief lists.
- **Static inspection plus safe live probes** — read-only queries, anon-key reads against protected tables, unauthenticated function calls to confirm rejections. Nothing destructive, no real customer records altered, no messages or emails sent to real people.
- **Then fix Critical and High findings**, re-verifying each. Medium/Low land in the report as a prioritised backlog.

## Model translation

Your brief's roles don't exist here. The real trust boundaries:

```text
superadmin  -> platform owner, can impersonate any tenant via signed token
admin/office -> full access within one organisation
engineer     -> own assigned jobs; optional office access flag
anon         -> public token links only (quotes, certs, receipts, booking links)
customers    -> database records, NOT user accounts (no customer login exists)
```

Equivalents for the tables your brief names: `service_calls` = jobs/bookings, `quotes` + `invoices` = payments, `job_messages` / `message_log` = messaging, `audit_log` + `customer_activity` = audit logs. There is no `disputes` or `payouts` table; those sections of the report will say so rather than invent findings.

## What gets inspected

1. **Every public table** — RLS enabled, policy count, whether each policy is org-scoped rather than role-only, and whether grants match the policies. Two tables already stand out: `login_attempts` and `org_price_list` have RLS on with zero policies.
2. **All 82 edge functions** — auth guard, org scoping, input validation, whether the service-role key is used to act on caller-supplied IDs without an ownership check. 23 have no obvious auth or signature guard and get read individually; several are read-only reporting endpoints (`get-business-insights`, `get-outstanding-invoices`, `get-tomorrows-jobs`) where missing auth would mean cross-tenant data exposure.
3. **All 32 anon-executable SECURITY DEFINER functions.** Several look wrong on their face and will be verified by live probe: `enqueue_email` and `read_email_batch` (could let an unauthenticated caller queue arbitrary email or read queued messages including password-reset links), `delete_email`, `move_to_dlq`, `expire_overdue_quotes`, `generate_receipt_number`, `next_org_invoice_number`.
4. **Public token surfaces** — quote acceptance, certificates, hazard notices, invoices, receipts, booking links: token entropy, expiry, single-use enforcement, and how much data each returns.
5. **Storage** — `business-logos` and `email-assets` are public; `certificates`, `quote-pdfs`, `job-media` are private. Only `job-media` restricts MIME type and size. Checks cover bucket policies, signed-URL lifetime, filename predictability, and cross-tenant path access.
6. **Auth configuration** — password policy, leaked-password check, email confirmation, session and token lifetimes, the invite-only signup restriction, and the existing 3-stage login lockout.
7. **Payments** — SumUp and Stripe paths: webhook signature validation, whether success is ever trusted from the browser, duplicate-charge and duplicate-refund protection, and whether amounts can be tampered with between quote acceptance and checkout.
8. **Superadmin impersonation** — the HMAC token path in `get_my_org_id()`, including expiry and replay.
9. **Business-logic transitions** — job status, quote acceptance, invoicing, and completion: which are enforced server-side versus only in the UI.
10. **Frontend** — any hardcoded secrets, `dangerouslySetInnerHTML`, sensitive values in URLs or local storage, and the security headers actually served.

## Deliverable

A report at `docs/security-review.md` with: executive summary, architecture, roles and trust boundaries, and per-area reviews (authentication, authorization/RLS, API, data protection, payments, file upload, business-logic abuse), then the findings table, prioritised remediation plan, and a manual testing checklist covering the tests your brief lists.

Every finding carries title, OWASP category, affected component, severity, description, attack scenario, business impact, evidence, remediation, and retest steps — and is labelled **Confirmed** (I have a probe result or policy text proving it), **Potential risk** (code reads badly but exploitability unproven), or **Requires manual validation** (needs a real session or provider dashboard I can't reach). Nothing gets called confirmed without evidence in the report.

## Then: remediation

After the report I fix Critical and High findings, most likely: revoking `anon` EXECUTE from the internal email-queue and numbering functions, adding auth guards to the unguarded reporting functions, and closing any cross-tenant policy gaps. Each fix is re-probed and the finding's retest steps are run. Anything that would visibly change app behaviour, I check with you before changing rather than breaking a working flow.

## Notes

- Rate limiting: the backend has no standard rate-limiting primitive, so the report will note the existing login lockout and record the rest as an accepted gap rather than a fabricated fix.
- Three known lower-severity findings are already open (`boiler_brands` cross-tenant read, two `quick_replies` org-scoping gaps) and will be folded into the report rather than double-counted.
- The security memory document gets updated at the end so future scans understand what is intentionally public here (token-based quote, cert, receipt and booking-link routes).
