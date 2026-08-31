# WhatsApp template audit + canonical catalogue + tenant-scoped Admin page

## What the audit already found (read-only, no changes yet)

There are **three disconnected WhatsApp systems**:

1. **The real send pipeline** — ~30 edge functions, each with its **own hard-coded message body**, all posting free text to `api.360messenger.com/v2/sendMessage` with a per-tenant key from `tenant_integrations` (`_shared/whatsapp.ts`, `_shared/whatsappCredentials.ts`). No shared body module exists.
2. **A documentation-only catalogue** — `src/lib/whatsappCatalogue.ts` (30 entries, **abridged** wording, explicitly "sends nothing"), rendered read-only by `src/components/admin/MessagingCatalogueTab.tsx`. Imported by zero send paths, so its bodies do not match production.
3. **A dead user-authored template system** — the `whatsapp_templates` table plus full CRUD at `src/pages/WhatsAppTemplates.tsx`. No send function ever reads this table, and the page is keyed on `user_id`, not `organisation_id`.

There is no `supabase/functions/_shared/whatsappCatalogue.ts` — the catalogue only exists on the frontend, which is why it can never be the source of truth for sends today.

Two important corrections to the brief:

- **There are no Meta/WhatsApp Cloud API templates.** 360Messenger sends free-form text, so "Meta template name / language / approval status" does not exist for any of these messages. The Admin page will show a "Free text (360Messenger)" delivery-channel field instead of inventing Meta metadata. (`whatsapp_templates` rows are seed data for a feature that never shipped.)
- The four ground-truth bodies in the brief are close but not byte-identical to production. Example: the live deposit message uses `☎` (not `☎️`) and `€{amount}` formatted to 2dp; the receipt includes an optional `Receipt:` line the brief omits. The audit records production text as ground truth and flags each difference for your decision rather than silently rewriting customer-facing copy.

## Phase 1 — Complete inventory (read-only)

Extract, for all ~30 send functions, the **exact** production body, every variable, and the table+column each variable resolves from (including how `organisation_id` is derived). Deliver as `docs/whatsapp/template-audit.md` plus the summary table you asked for. No code changes in this phase.

Known variable-source problems already visible, to be confirmed here:

- `_shared/depositLink.ts` reads `company_name`/`company_phone` from `tenant_integrations.360messenger.config` **only** — not from `settings.business_phone`, which is where tenants actually edit their phone. That is the deposit-template phone bug.
- `accept-quote` resolves the internal office alert through `settings` keyed by **`user_id`**, a different path from the job's `organisation_id` used everywhere else.
- Several functions read org branding from `settings`, others from `tenant_integrations`, others via `_shared/orgBranding.ts` — three chains for the same three fields.

## Phase 2 — Canonical catalogue, shared by both sides

Create `supabase/functions/_shared/whatsappCatalogue.ts` as the single source of truth: for each message id, the exact body **builder** (a pure function of resolved tenant config + job data) plus metadata (name, category, trigger, function, `message_log.message_type`, variable list, config dependencies).

`src/lib/whatsappCatalogue.ts` becomes a thin re-export of that shared definition (mirrored file kept byte-identical by a test), so the Admin page and production sends cannot drift. Bodies move from abridged to exact.

Also add `_shared/orgBranding.ts`-backed unified resolution so `org_name` / `org_address` / `org_phone` have **one** chain, tenant-scoped, fail-closed, no cross-tenant or hard-coded fallback.

## Phase 3 — Refactor send functions onto the catalogue

One category per step (Quotes → Payments/Deposits → Invoices & receipts → Bookings/reminders → Documents/renewals/inbound), each step independently revertible. Each function keeps its existing skip/degrade, opt-out and logging behaviour; only the body construction and branding resolution move. Byte-for-byte output equality against the current string is asserted by a unit test per message before the function is deployed.

Fix the `org_phone` source in the deposit path and any sibling found in Phase 1, in their own isolated steps.

## Phase 4 — Admin page

Rebuild the Admin WhatsApp Templates surface to render the catalogue dynamically (no hard-coded cards), grouped by category, showing per template: friendly name, catalogue key, delivery channel, exact body with the selected tenant's resolved values, variable list with its resolution source, sending function, `message_log` type, config dependencies with ready/degrade/skip status, and the tenant's 360Messenger sender number.

Tenant isolation: all reads filtered by the selected `organisation_id`, superadmin-gated, with no fallback to another tenant. The legacy `user_id`-keyed `whatsapp_templates` CRUD page is retired from navigation (table left untouched).

## Phase 5 — Tests + final report

- Body-equality tests per template (pre/post refactor identical output)
- Variable-resolution tests, including `org_phone` from the correct tenant source
- Tenant-isolation tests: tenant A's config never appears for tenant B; missing config skips rather than falling back
- Catalogue/send-path coverage test: every send function has a catalogue entry and vice versa
- Final audit report with the Template / Key / Channel / Send location / Status table

## Risk and gating

This touches quotes, deposits, invoices and receipts — money path. Nothing is deployed without the equality tests passing, each phase is its own review-gated step, and verification runs against two tenants (K&N + Dublin Gas or Cavan). No DB writes are part of this work.

Note: Dublin Gas WhatsApp sends are currently failing with 403 from 360Messenger (open issue), so live DG send verification may be blocked; that will be reported honestly rather than rounded up.
