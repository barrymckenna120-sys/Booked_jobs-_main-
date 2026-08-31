# WhatsApp Phase 2 — canonical catalogue and branding resolver

Status: **infrastructure landed, nothing rewired yet.** Phase 2 adds the single sources of
truth and their tests. No Edge Function imports them yet, so **no customer-facing message
changed in this phase** — that is Phase 3, one send path at a time.

## What landed

| File | Role |
| --- | --- |
| `supabase/functions/_shared/whatsappCatalogue.ts` | Canonical catalogue: 39 entries, pure body builders, per-entry variables / config dependencies / skip rules / known defects. |
| `supabase/functions/_shared/whatsappCatalogue.test.ts` | 43 tests: structural completeness, send-site coverage, purity, and byte-for-byte output equality against current production bodies. |
| `supabase/functions/_shared/orgBranding.ts` | Tenant-scoped resolver for `org_name`, `org_address`, `org_phone` (+ `footer`), with explicit precedence and a legacy compatibility shim. |
| `supabase/functions/_shared/orgBranding.test.ts` | 12 tests: precedence, per-tenant isolation, missing-field reporting, and legacy-output compatibility. |
| `scripts/generate-whatsapp-catalogue.mjs` | Mirrors the canonical catalogue into `src/lib/whatsappCatalogue.generated.ts`. `--check` fails on drift. |
| `src/lib/whatsappCatalogue.generated.ts` | Byte mirror of the canonical file. Never edited by hand. |
| `src/lib/whatsappCatalogue.ts` | Now *derives* its message inventory from the mirror. Keeps only display-layer concerns: config-key labels, tenant config resolution, status derivation, preview rendering. |

## Design rules held

- **Builders are pure.** No IO, no `Deno.env`, no Supabase client, no imports at all — enforced
  by a test that greps the module for code-shaped access patterns. A builder cannot switch
  tenant because it never learns what a tenant is; the caller resolves values first, starting
  from a confirmed `organisation_id`.
- **Output equality over correctness.** Every builder reproduces the current production body
  byte-for-byte, defects included, and each defect is recorded on the entry:
  - `job_reminder_2day` still interpolates the literal `"undefined"` (F1).
  - `payment_received` still prefixes job refs with `KN-` for every tenant (F2).
  - `warranty_day14` still says "registered Gas Safe engineer" (F3).
  - All four money formatters are preserved side by side (D5).
  These are fixed as deliberate copy changes, never inside a refactor.
- **The catalogue owns the `message_log.message_type` vocabulary** (D14): `CATALOGUE_MESSAGE_TYPES`.
- **`_shared/notifyAdmin.ts` is explicitly excluded** (`EXCLUDED_SEND_PATHS`). It messages the
  platform admin using global secrets, with no `organisation_id`, no opt-out and no
  `message_log` row. It must never be migrated into the tenant catalogue.
- **Externally-authored bodies are entries with `build: null`** and a named `bodyOwner`
  (Make.com scenarios, JSON feeds, orchestrators, stored inbound customer text).
  `buildCatalogueMessage` throws for those rather than returning an empty string.

## Branding precedence (as implemented)

| Field | Chain |
| --- | --- |
| `org_name` | `settings.business_name` → `settings.company_name` → `tenant_integrations.360messenger.config.company_name` → `tenant_integrations.make.config.company_name` → `organisations.name` |
| `org_phone` | `settings.business_phone` → `settings.company_phone` → `tenant_integrations.360messenger.config.company_phone` → `tenant_integrations.make.config.company_phone` |
| `org_address` | `settings.business_address` → `organisations.address` |
| `footer` | `settings.message_footer` → `org_name` |

- Resolution is **only** by `organisation_id`. A blank/missing id throws `BrandingScopeError`;
  there is no `user_id` path, which closes D2 for every migrated caller.
- Unresolved fields are returned blank and listed in `missing` — never silently substituted
  with another tenant's value and never defaulted to K&N.
- Junk tokens (`"undefined"`, `"null"`, `"NaN"`, whitespace) are rejected as unresolved (D12).
- `settings.business_address` is the only real address source; `organisations.address` is a
  registered-address fallback. There is no `settings.company_address` column.

## Conflicts found between output equality and the new resolver

1. **The legacy shim had to be narrowed to `settings` only.** The canonical `org_name`/`org_phone`
   chains reach into `tenant_integrations` and `organisations`, which the old inline helper never
   read. Left as-is, simply adopting the canonical resolver would have changed live wording for
   any org whose `settings` row is blank but whose 360Messenger config is populated — a silent
   copy change inside a refactor. `toLegacyBranding()` therefore surfaces a value only when it
   came from a `settings.*` source, and keeps the `"our team"` default. Callers opt into the
   wider chain deliberately, per send path, in Phase 3.
2. **Two hardcoded name fallbacks remain in the baseline** — `"our team"` (most paths) and
   `"us"` (`send-booking-confirmation`). The catalogue reproduces both. Consolidating them is
   an F4 copy change.
3. **`org_address` has no current consumer.** No production WhatsApp body contains a business
   address, so the resolver exposes the field with no equality test to satisfy. First use will
   be a new copy decision, not a migration.
4. **`renewal_reminder` config behaviour was mis-recorded before Phase 2.** The old frontend
   catalogue marked `renewal_form_url` as *skip* and the company name/phone as *degrade*. Read
   back against `send-renewal-reminder/index.ts`, all three only degrade: a missing Tally URL
   swaps the booking line for reply/call wording and the message still sends. The canonical
   entry now records the verified behaviour, and the frontend test that encoded the wrong
   expectation was corrected.
5. **`deposit_link` logs its `message_type` from `_shared/depositLink.ts`,** not from
   `send-deposit-link/index.ts`. The frontend drift test now searches every source an entry
   claims, including shared modules.

## Drift protection

- `node scripts/generate-whatsapp-catalogue.mjs --check` fails when the mirror is stale.
- A vitest case asserts the mirror is a banner + byte copy of the canonical file and that
  every canonical entry derives into the frontend catalogue.
- A Deno test scans `supabase/functions/*/index.ts` for send markers and fails when a send
  site is neither a catalogue entry nor on the config-only allowlist, so a new send path
  cannot be added without appearing in the catalogue.

## Not done in Phase 2 (deliberately)

- No Edge Function was rewired to import the catalogue or the resolver (Phase 3).
- No customer-facing wording changed; F1–F4 remain open.
- The Admin panel still renders through the existing components — it now reads real builder
  output instead of abridged hand-written templates, but the UI rebuild is Phase 4.
