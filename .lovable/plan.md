# Correct New Tenant Initialisation — Phase 1 proposal (no changes made yet)

Everything below comes from reading the live configuration of K&N Gas Services and the code that consumes it. Several items the earlier audit listed as "missing" turn out **not** to be needed, because the app already treats their absence as the normal case. Those are called out so we don't build work that adds no value.

## Phase 1 — Classification table

Classes: **A** standard product behaviour · **B** tenant default to create automatically · **C** company must supply · **D** customer data, never copied · **E** credential, never copied.

| Configuration | K&N current value | Class | New tenant default | Provision automatically? |
|---|---|---|---|---|
| Organisation record | name, slug, prefix KN, trial | C | from the New Tenant form | Yes (already) |
| Owner login + profile + engineer record | admin role, office access | A/B | same three records | Yes (already) |
| `organisations.owner_user_id` | set | A | set | Yes (already fixed) |
| Public web address | kngasservices.bookedjobs.ie | C | `<slug>.bookedjobs.ie`, blank if taken | Yes — derive, don't copy |
| Company name / phone / address / email / RGI | K&N values | C | from the form | Yes (already) |
| Message footer | "K&N Gas Services" | B | `name \| address \| phone` | Yes (already) |
| Certificate prefix | KN | B | first 2 letters of slug | Yes (already) |
| Invoice prefix / next number | K, 1 | B | first letter of slug, 1 | Yes — add |
| Default prices (callout 85, service 130, emergency 160, repair 0) | set | B | same numbers as product defaults | Yes — add |
| Quote settings (expiry 30 days, VAT on, deposit 50%, default deposit 100) | set | B | same | Yes — add |
| Default terms | 14-day payment, 12-month warranty wording | B | generic product wording, no company name | Yes — add |
| Opening hours | Mon–Fri 08:00–17:00, Sat 09:00–13:00, Sun off | B | same | Yes — add |
| Job time blocks | Morning/Midday/Afternoon with caps | B | same | Yes — add |
| Renewal reminders (30 + 7 days, enabled) | set | B | same | Yes — add |
| Review requests (2 hours, enabled) | set | B | same | Yes — add |
| Payment reminders (7 + 14 days, enabled) | set | B | same | Yes — add |
| Delivery-failure alerts (immediate; quotes + invoices on) | set | B | same | Yes — add |
| Receipt shows boiler details | on | B | on | Yes — add |
| Job/product categories | 8 (Boilers, Parts, Labour, Materials, Heat Controls, Heat Pumps, WiFi & App Units, pipe work) | B | 6 clean categories (Boilers, Parts, Labour, Materials, Heat Controls, Pipework) | Yes — add |
| Products / prices | 8 rows, real K&N part prices | C/D | none — empty catalogue | No |
| Boiler brands | 25 rows | A | **already shared** — the app reads this catalogue without company filtering, so new tenants already see all 25 | No change needed |
| Engineer working days | 1 row | A | **not needed** — a missing row already means "working" | No |
| WhatsApp templates table | 34 rows | A | **not needed** — every live message is built in code (`_shared/whatsappCatalogue.ts`); those 34 rows feed only the admin viewing screen | No — retire the K&N-master copier instead |
| `settings.template_*` message templates | 5 set | — | **not needed** — no send path reads them; they are edit-only leftovers | No — flag as separate cleanup |
| Service areas (D15, D6, K67) | set | C | empty | No |
| Google review URL | K&N link | C | empty | No |
| Branding colours / font | no row at all | B | one row with real product defaults | Yes (row exists today; fill values) |
| Logo | K&N logo | C | none | No |
| Accountant email | set | C | empty | No |
| WhatsApp integration row | configured | C+E | placeholder, no key, country 353 | Yes (already) |
| Booking form links (Tally) | configured | C | empty placeholder | Yes (already) |
| Payment integration (SumUp) | live credential | E | placeholder row, no key, environment explicitly "sandbox" | Placeholder only |
| Webhook secret | per company | E | generated fresh per tenant | Yes — generate, never copy |
| Config version | none | B | `tenant_config_version = 1` | Yes — add |
| Customers, jobs, quotes, invoices, certificates, messages | live data | D | none | Never |

## What I recommend NOT making a BookedJobs default

- **The 34 WhatsApp template rows.** They are a record of Meta registration, not the message source. Copying them from K&N is the single worst piece of tenant coupling in the system and it buys nothing at send time.
- **The 5 `settings.template_*` fields.** Nothing reads them; provisioning them would create the false impression that editing them changes customer messages.
- **K&N's product/price list, service areas, review link, logo.** Commercially specific.
- **Engineer working-day rows and per-tenant boiler brands.** The app already behaves correctly without them.

## What changes

**Files**
- `supabase/functions/provision-tenant/index.ts` — extend with the defaults above, made re-runnable.
- `supabase/functions/_shared/tenantDefaults.ts` — **new**: the product-owned defaults (settings values, categories, terms, branding, config version) as plain data, no company names, no UUIDs.
- `supabase/functions/validate-tenant/index.ts` — **new**: PASS/FAIL check per area for one company, superadmin only.
- `src/pages/admin/TenantDetail.tsx` — remove the hardcoded K&N UUID; show the config version and the validation result.
- `supabase/functions/provision-whatsapp-templates/index.ts` — stop using K&N as master (either point it at the code catalogue or retire it).
- Unit tests for the defaults module and the validation logic.

**Database**
- One migration: add `organisations.tenant_config_version` (integer, default 0 for existing rows, new tenants get 1). No policy changes, no new tables, no changes to existing tenant data.

**Not touched**: RLS policies, role resolution, quote workflow code, existing tenants' data.

## What happens when a new tenant is created afterwards

The New Tenant form works exactly as now, then provisioning additionally writes: full default settings (prices, quote rules, opening hours, time blocks, reminder schedules, alert preferences, terms, invoice numbering), a derived `<slug>.bookedjobs.ie` web address, real branding values, six empty job categories, a placeholder payment integration marked sandbox, a freshly generated webhook secret, and `tenant_config_version = 1`. It then runs the validation check and returns a PASS/FAIL line per area with the response. Running it twice for the same company changes nothing and creates no duplicates.

Result: a brand-new company can log in, add customers and jobs, assign engineers, raise a quote with a number, PDF and approval link, send it on WhatsApp with correct branding, take a deposit once its own payment credential is added, complete jobs, issue certificates and run renewals — with no developer touching the database. The two things a human must still supply are the company's own WhatsApp/payment credentials and its booking form links; both are credentials or external accounts and cannot be generated.

## Risks to existing tenants

- Low. The only shared write is the new column, added with a default that leaves existing rows unchanged.
- K&N, Dublin Gas and Cavan Gas are not modified and stay at version 0; a backfill is a separate, later decision.
- Changing the template copier affects only the superadmin screen that lists templates, not any customer message.
- Removing the hardcoded K&N UUID from the admin page is the one frontend change; it needs a click-through of the tenant detail screen.

## Phase 11 verification (after approval)

Create a fresh test company through the normal superadmin form, then walk: login → team → customer → job → assign engineer → quote → number → PDF → approval link → send message → approve → deposit → complete → certificate → renewal, with no manual database work. Then re-run provisioning on that same company to prove no duplicates, and click through K&N to confirm nothing changed.

## Stop point

No code or database changes have been made. Approve and I will implement in this order, one reviewable step each: (1) defaults module + migration, (2) provisioning extension, (3) validation check, (4) template-copier decoupling, (5) clean-tenant test.
