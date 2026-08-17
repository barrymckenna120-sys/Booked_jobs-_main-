# WhatsApp Message Catalogue (read-only admin page)

A superadmin-only page listing every outbound WhatsApp message type the system can send, with the wording structure and the values each tenant would actually resolve to.

## Answers to the four scoping questions

### 1. Data source — hybrid: static catalogue + live config lookup

Recommendation: keep the **wording structure static** (defined in code) and resolve **tenant field values live** at render time.

- The template body of each message lives in the function source. Making that generic would mean rewriting ~30 functions to publish their template — a large, risky change for a read-only reporting page.
- The volatile part is not the wording, it's the tenant config (`settings.company_name`, `settings.company_phone`, review URL, `tenant_integrations` rows, footer). Those change whenever an admin edits Customer Integrations, so they must be read live or the page becomes misleading — exactly the class of bug that caused the recent branding-literal sweep.
- So: a hardcoded catalogue of message types (template skeleton + the config keys it depends on), and one live query per tenant for the config keys. Values get substituted into the skeleton for preview, with a "not configured — this message will skip / degrade" state per field.
- Rejected: a seeded reference table. It duplicates config values into a second store that silently drifts, and needs a re-seed job every time branding changes. No benefit over a live read of 2 small tables.

### 2. Source of truth for the message-type list — one central shared catalogue

Put it in a single module, not inside the page component:

- `src/lib/whatsappCatalogue.ts` — id, human name, purpose, trigger (cron / user action / webhook), the Edge Function that sends it, the config keys it reads, the `message_log.message_type` value it writes, and the missing-config behaviour (`skip` vs `degrade`).
- Central because the same metadata is useful beyond this page: Message Log filters, System Logs, and future per-tenant enable/disable toggles all want the same list of message types and their labels.
- Accuracy is enforced by a lightweight unit test that asserts every catalogue entry's function name exists in `supabase/functions/` and every `message_type` string used in the catalogue matches one actually written by that function. That catches drift when a function is added or renamed.

### 3. Tenant selector — pick one tenant, show all message types

With 6 tenants and ~30 message types, a tenants-as-columns matrix is 180 cells of long text strings — unreadable, and it will not fit on mobile at all.

Recommendation: a tenant picker at the top, then a list of the ~30 message types for that tenant. Each row collapses to name + status pill (Ready / Will skip / Will degrade); expanding shows purpose, trigger, the resolved field values, and the previewed message body. Plus a filter to show only problem rows, which is the actual reason an admin opens this page.

### 4. Nav placement — new tab in `/admin`, cross-linked from Customer Integrations

`/admin` already uses a tab bar (Tenants, Customer Integrations, Unblock Users, User Activity, Import Runs). Add a **Messaging** tab there. It spans all tenants, so nesting it inside a single tenant's Customer Integrations editor would be the wrong scope. Customer Integrations gets a link into it for the currently edited tenant, since that is where a "will skip" finding gets fixed.

## Technical notes

- Page: `src/components/admin/MessagingCatalogueTab.tsx`, rendered from a new `TabsContent value="messaging"` in `src/pages/AdminPanel.tsx`. Superadmin-gated like the existing tabs.
- Reads only: `organisations` (picker), `settings`, `tenant_integrations` for the selected org. No writes, no Edge Function calls, no sends.
- Status derivation reuses the guard semantics already implemented in the functions (`skip` on blank footer, `degrade` where the footer is optional) so the page reflects real runtime behaviour rather than a separate opinion.
- Preview rendering is display-only string interpolation in the client; it never triggers a message.
- Out of scope: editing config here, per-tenant message toggles, and refactoring functions to export their templates.
