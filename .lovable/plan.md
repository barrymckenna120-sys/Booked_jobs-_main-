# Tenant-facing "Message Status" view (read-only)

## What already exists (audit result)

Something exists, but it does **not** cover per-message-type status or config gaps.

1. **Settings → Messaging** (`src/components/settings/MessagingTab.tsx`)
   - Renders `WhatsAppTab` (read-only) + `QuickRepliesTab` (editable).
   - `WhatsAppTab` shows the message footer and **6** hardcoded template bodies (Booking Confirmation, Renewal Reminder, Review Request, Quote, Payment Link, Certificate) in read-only textareas, plus variable badges. Bodies come from `settings.template_*` columns falling back to hardcoded defaults.
   - It shows **wording only** — no status, no notion of whether a message will actually send, no config-gap detection.
   - Note for later: this file hardcodes `"K&N Gas Services"` as the footer fallback and inside the booking-confirmation default body, so other tenants see K&N wording here. Same class of leak as the branding sweep, tenant-facing this time. Worth a separate ticket; out of scope for this plan.

2. **`/whatsapp` page** (`src/pages/WhatsApp.tsx`) with a Templates tab embedding **`/whatsapp/templates`** (`src/pages/WhatsAppTemplates.tsx`)
   - Fully **editable** CRUD over the `whatsapp_templates` table (name, body, message_type from a 6-item free-text list, default flag), scoped by `user_id`.
   - This is a legacy/parallel template store, unrelated to the ~35 Edge Function messages actually sent. No status, no config gaps.

3. **`WhatsAppConnectionBanner`** — a global banner shown on a 360Messenger connection error. Binary transport-level warning only.

4. **Settings → Integrations** (`src/components/settings/IntegrationsTab.tsx`) — tenant-editable rebooking URL, new booking URL, Google review URL, Stripe link, company name/phone. This is the tenant-facing equivalent of the superadmin Customer Integrations tab, and it is where a tenant can already fix most gaps themselves.

Conclusion: no existing view answers "is this message type working for me right now?" — the new view is genuinely new, and it should sit next to, not inside, the existing template listing.

## Where it lives

Settings already uses a sidebar with `Messaging` (key `messaging`) between `Team & Users` and `Reminders`. Add the new view as a **section at the top of the existing Messaging tab**, above "Message Templates":

```text
Settings
  General / Products / Brand / Team & Users
  Messaging          <- Message Status (new, top)   then Message Templates, Quick Replies
  Reminders / Quote & Invoice Defaults / Finance / Integrations / ...
```

Reasons: no new nav entry for a small read-only panel; a tenant landing on Messaging expects to learn whether messaging works before reading wording; and it keeps one messaging destination rather than splitting status and templates across two tabs.

Access: admin/office only. Engineers do not reach Settings → Messaging, and the panel additionally checks role so it renders nothing for an engineer.

## What the panel shows

Header row: overall state — "All messages active" or "3 message types paused".

Then message types grouped by the catalogue's categories (Booking & scheduling, Reminders, Quotes, Payments, Invoices & receipts, Documents, Parts, Renewals, Retention). Each row:

- Message name and one-line purpose ("Prompts the customer to rebook their annual service")
- Status pill: **Active** or **Paused — needs setup**
- When paused, one plain-language line naming the missing thing and the consequence:
  - "Your rebooking form link isn't set up yet — renewal and warranty reminders are paused until it's added."
  - "Your message footer is empty — quotes, receipts and certificates won't send until you add it."
  - "Your SumUp merchant code is missing — deposit and payment links can't be created."
- No reason codes, no template bodies, no wording preview, no other tenants.

Degraded rows (message still sends, one detail missing) show **Active** with a quieter note: "Sending, but without your phone number — add it so customers can call you back." A tenant does not need the skip/degrade vocabulary; they need to know whether messages go out.

Filter: a single "Show only what needs attention" toggle, on by default when anything is paused.

## Fix path: deep-link for self-service, support only as fallback

Recommendation: **link to the field**. Every gap that can cause a pause maps to a field the tenant can already edit themselves in Settings → Integrations (rebooking URL, new booking URL, Google review URL, company name/phone) or Settings → General (message footer, cert prefix). Each paused row gets a "Set this up" link that switches to the owning tab and focuses the field. Telling a tenant to contact support for a URL they can paste themselves creates support load for nothing.

Two exceptions get "Contact support" instead, because the tenant cannot self-serve them:
- **SumUp merchant code / API key secret** — the key lives in backend secrets.
- **360Messenger secret name / WhatsApp connection** — provisioning-level.

## Technical notes

- New component `src/components/settings/MessageStatusPanel.tsx`, rendered at the top of `MessagingTab`.
- Reuses the superadmin catalogue module (`src/lib/whatsappCatalogue.ts`): same `WHATSAPP_CATALOGUE`, same `resolveTenantConfig`, same `deriveMessageStatus`. The tenant view adds only a presentation layer that maps `skip`/`degrade` + missing keys to plain-language copy, and never renders `template`.
- Plain-language copy lives in one map keyed by config key (`ConfigKeyId` → tenant sentence + fix target tab/field), so superadmin reason codes and tenant wording cannot drift apart.
- Data: the tenant's own `settings` row and `tenant_integrations` rows for their `organisation_id` (via `useOrgId`), under existing RLS — no cross-tenant read is possible, and no service-role path is added.
- Strictly read-only: no mutations, no Edge Function calls, no sends. Verification will include a network-log check that the panel issues only `GET`/select traffic.
- Depends on the superadmin Messaging tab work landing first (it owns the catalogue module).
