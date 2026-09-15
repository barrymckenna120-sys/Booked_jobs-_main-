# Multi-Tenant Provisioning & Parity Audit — findings only, no changes made

## 1. Executive summary

A new company does not get a working copy of the product. It gets a **shell**: company row, one admin user, one settings row, an empty branding row, one engineer record, and two integration rows. Everything else that makes K&N Gas Services feel complete — 34 WhatsApp templates, message templates, product/price catalogue, boiler brands, working days, payment credentials, booking form links — was built up by hand in K&N over months and is never created for anyone else.

On top of that, several features quietly fall back to a default instead of failing loudly when a new company's configuration is missing, so the new company appears to work while sending reduced messages. Two known failures (quote links missing, "Insufficient permissions" on Team Management) are both symptoms of this: neither was a code bug in the feature itself.

Verified today against the live database and the code.

## 2. How multi-tenancy actually works

- Every core table carries `organisation_id`; access is enforced by database rules.
- The app decides which company you are in from your **profile** record. If that lookup is slow or fails, the app continues with "no company" rather than stopping (`src/hooks/useOrgId.ts:29-56`).
- A superadmin can view another company through a signed impersonation token; an older unsigned header path still exists alongside it (`src/integrations/supabase/orgHeaderInterceptor.ts:98-99`).
- Server functions derive the company from the caller, from the record being acted on, or from a per-company webhook secret (`supabase/functions/_shared/orgAuth.ts`).
- **There are no feature flags.** `bookedjobs_plan` is display-only; `bot_enabled`/`bot_name`/`bot_phone` have no readers anywhere; only `is_test` gates anything (the data-reset tool).
- Roles live in **two** places — `engineers.role` and `profiles.role` — and the database helper `get_user_role()` reads only the engineer record, defaulting to "engineer". This is the origin of the Team Management failure.

## 3. What tenant creation actually does today

`supabase/functions/provision-tenant/index.ts`, called from the superadmin "New Tenant" form (`src/pages/AdminPanel.tsx:1592`):

```text
create organisation (name, slug, trial, prefix, industry hardcoded "gas_heating")
  -> invite owner by email (sets company + role in auth metadata)
  -> upsert profiles row (role "admin")
  -> update organisations.owner_user_id
  -> upsert settings row (company name/phone/address/footer/cert prefix)
  -> insert brand_settings row  [organisation_id ONLY — no colours, no font]
  -> upsert engineers row (role "admin", office access)
  -> insert tenant_integrations: "360messenger" + empty "tally"
  -> done
```

Nothing else. No transaction, no idempotency key, no version stamp; a partial failure leaves a half-built company (there is a rollback delete for one guard only).

## 4. K&N vs new tenant — verified differences

| Component | K&N (8c37827f) | New tenant (c0aa41ac) | Class | Root cause |
|---|---|---|---|---|
| WhatsApp templates | 34 | **0** | B | Never provisioned; only `provision-whatsapp-templates` copies them, and it hardcodes K&N as master |
| Message templates (quote/booking/renewal/review/payment) | all set | **all NULL** | B | Provisioning writes none |
| `default_terms`, `accountant_email` | set | NULL | B/C | Not provisioned |
| Branding (colours/font) | **no row** | row exists, defaults | B | Provisioning inserts an empty row; K&N has none at all — reversed |
| Products / categories | 8 / 8 | 2 / 2 (manual) | B | Not provisioned |
| Boiler brands | 25 | **0** | A | Shared catalogue, but rows are org-scoped and only K&N has them |
| Price list (`org_price_list`) | 0 | 0 | B | Feature unused by every tenant |
| Engineer working days | 1 | **0** | B | Not provisioned |
| Payment credentials (SumUp) | webhook secret only | webhook secret only | E | No admin UI; manual DB write required |
| Booking form links (Tally) | configured | **empty config** | C | Provisioned as `{}` |
| Quote numbering | per-company | per-company (Q-2026-0001) | — | Already fixed |
| Public web address | set | set (added today) | C | Not assigned at creation |

Dublin Gas and Cavan Gas show the **same** gaps (0 WhatsApp templates, 0 boiler brands, 0 working days) — this is systemic, not specific to the newest company.

## 5. Missing provisioning (should be automatic, currently isn't)

WhatsApp templates · message templates · default terms · job/product catalogue · boiler brands · engineer working days · booking + renewal form links · public web address · payment/integration placeholders · branding defaults (real values, not an empty row) · a provisioning version stamp.

## 6. Hard-coded tenant dependencies (evidence)

- `provision-whatsapp-templates/index.ts:4` — `MASTER_ORG_ID = "8c37827f…"` (K&N); line 137 strips `kn_gas_`; line 140 replaces `kngasservices.bookedjobs.ie`. **New tenants' templates are literally derived from K&N.**
- `src/pages/admin/TenantDetail.tsx:160` — same K&N UUID duplicated.
- `src/pages/IncomingJobsDebug.tsx:8,96,182` — `KN_ORG_ID` compared directly.
- `src/pages/AdminPanel.tsx:461` — Cavan Gas UUID literal.
- `src/pages/ResetAdmin.tsx:13` — reset link hardcoded to `kngasservices.bookedjobs.ie`.
- `src/components/customer/ServiceHistory.tsx:241` — slug falls back to `"kngasservices"`.
- `src/components/settings/WhatsAppTab.tsx:109,118`, `src/components/jobs/PartsArrivedModal.tsx:48` — footer defaults to `"K&N Gas Services"` for any tenant.
- `src/pages/WarrantyDetail.tsx:148` — K&N name + phone `087 3685252` inside a message body.
- `send-email/index.ts:1,105` and `auth-email-hook/index.ts:49` — `plumb-on-call.lovable.app`, `@karlsgas.ie` addresses for all tenants.
- `_shared/platformPublicUrl.ts:10` — platform fallback host is `karlsgas.lovable.app`.

## 7. Fallback paths that silently reduce functionality

- `send-booking-confirmation/index.ts:97` — missing template mapping falls back to generic `"booking_confirmation"`.
- `_shared/sumupCredentials.ts:89-98` — unknown environment label defaults to **live** payments.
- `renewal-reminder-14/30` — missing country code defaults to `"353"`.
- `trigger-outstanding-reminder/index.ts:106` — missing company name/phone become empty strings in customer messages.
- `trigger-review-request/index.ts:115` — missing per-tenant secret falls back to a global secret name.
- `notify-import-errors/index.ts:111` — links default to `karlsgas.lovable.app`.
- `review-request`, `send-whatsapp-receipt`, `notify-delivery-failure` — missing settings become `""` and the feature silently no-ops.

## 8. Quote workflow root cause

The quote message body is **hard-coded** in `send-quote-whatsapp/index.ts:332-362`. `settings.template_quote_sent` is editable in Settings but **read by no server function** — editing it does nothing. The approval and PDF links are built from the company's own web address; when it is blank they are omitted with a warning (`index.ts:176-195`), which is exactly what produced the short message. The PDF function is stricter than the WhatsApp function (it omits the link with no fallback), so the two can disagree. `message_footer` blank causes a silent "skipped" 200 response.

## 9. Team Management root cause

`get_user_role()` reads only the engineer record and defaults to "engineer", never consulting the profile. Office/admin staff without an engineer record therefore fail role checks. Role allow-lists diverge across at least **9** places (frontend type omits `owner`/`superadmin`; `resetRoles.ts:8` invents `owner_manager`; six different role sets across database policies). Two functions already patch this individually rather than centrally.

## 10-12. Recommended architecture (design only)

- **One `provisionTenant`** covering everything in §5, idempotent per company, writing a `tenant_config_version` stamp and only marking the company ready at the end. Templates seeded from a **product-owned catalogue**, not from K&N.
- **One role source of truth**: profile-first resolution, one shared allow-list used by frontend, functions and database policies.
- **`validateTenant(organisationId)`** health check returning PASS/FAIL per area (organisation, admin, roles, settings, branding, templates, quote workflow, approval URL, PDF, WhatsApp, notifications, certificates, payments, booking) plus config version.
- **Clean-tenant integration test**: create company → admin → customer → job → engineer → quote → PDF → approval URL → approve → deposit → payment → complete → certificate → renewal, with zero K&N data.

## 13. Remediation priorities

- **P0** — unsigned `x-org-id` fallback still live; SumUp environment defaulting to live; divergent role sets in database policies.
- **P1** — provisioning gaps (§5); K&N-as-master template provisioning; role resolution ignoring profiles; missing web address at creation; silent-degrade fallbacks in customer-facing messages.
- **P2** — tenant health check; clean-tenant test; provisioning transaction + version stamp.
- **P3** — dead columns (`bot_*`), `plumb-on-call`/`karlsgas.ie` literals, debug pages with hardcoded UUIDs, unused `org_price_list`.

Nothing was changed. Next step, on your word: turn §4 and §5 into a single scoped P1 provisioning change, one concern at a time.
