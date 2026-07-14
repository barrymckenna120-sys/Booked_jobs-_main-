## Scope
Introduce a shared WhatsApp helper and migrate 6 tenant-messaging Edge Functions off the hardcoded `THREESIXTY_API_KEY` onto per-org `tenant_integrations.config.api_key_secret` resolution. Also fix the Superadmin Customer Integrations UI so the "API Key" field actually writes to the row those functions now read from. `notifyAdmin.ts` and the other 13 `config.api_key`-only senders are explicitly out of scope.

## Files touched (exact list)

**New**
- `supabase/functions/_shared/whatsapp.ts` — exports `getWhatsAppConfig(supabase, organisationId)` and `normalisePhone(raw)` exactly as specified.

**UI (1 file)**
- `src/components/admin/CustomerIntegrationsTab.tsx` — retarget the single "360dialog API Key" field:
  - `type: "whatsapp"` → `type: "360messenger"`
  - `key: "api_key"` → `key: "api_key_secret"`
  - `label: "360dialog API Key"` → `label: "360Messenger Secret Name"`
  - Add help text: stores the **name** of a Supabase secret (e.g. `THREESIXTY_API_KEY_DUBLIN_GAS`), not the raw key value.
  - `secret: true` stays. No other field on the page changes.

**Edge Functions (6 files)** — for each, swap `Deno.env.get("THREESIXTY_API_KEY")` for `await getWhatsAppConfig(supabase, <orgId>)` and swap local phone cleaning for `normalisePhone(...)`. Org-id variable already in scope per audit:

| File | Line | Org variable in scope |
|---|---|---|
| `create-job-invoice/index.ts` | 399 | `job.organisation_id` |
| `accept-quote/index.ts` | 197 | resolved earlier from quote/job |
| `accept-quote/index.ts` | 316 | `orgId` (from `service_calls` lookup at ~324) — will hoist the lookup above the send if 316 currently precedes it |
| `quote-accepted-alert/index.ts` | 58 | resolve from `customers.organisation_id` via `quote.customer_id` (already fetched at bottom of file for notifications) — hoist that lookup above the send |
| `send-whatsapp-receipt/index.ts` | 18 | `job.organisation_id` |
| `send-extrawork-payment-link/index.ts` | 16 | `job.organisation_id` (already fetched at line ~63 as `orgId`) — hoist above the top-of-handler key check |
| `whatsapp-inbound/index.ts` | 104 | `customer.organisation_id` (already resolved as `inboundOrgId` at line 55) |

If any hoist turns out to require restructuring beyond a local reorder, I will stop and report back rather than restructure logic.

**Not touched**
- `supabase/functions/_shared/notifyAdmin.ts` (platform admin alerts — stays on global key).
- The other 13 `config.api_key`-only senders.
- Any other file.

## Behaviour after change
- K&N: `api_key_secret = "THREESIXTY_API_KEY"` → resolves to the existing global secret → sends succeed unchanged.
- Dublin Gas / Cavan Gas: `api_key_secret` points at an unset secret → helper throws → send fails loudly (no silent K&N-account fallback).
- Phone normalisation is uniform across the 6 files.

## Verification (post-deploy, after diff approval)
1. `supabase--deploy_edge_functions` for the 6 functions (Publish does not redeploy Edge Functions).
2. `message_log`: query recent K&N rows across `receipt`, `extra_work_payment`, `quote_accepted`, `invoice`, inbound — confirm `status='sent'` for post-deploy timestamps.
3. `edge_function_logs`: scan for new errors on the 6 function names in the 15 min after deploy; expect zero for K&N, expect "Secret … not set" only for Dublin Gas / Cavan if they triggered a send.

## Out of scope / follow-up
- Migrating the remaining 13 `config.api_key`-only functions.
- Adding a real Supabase secret for Dublin Gas / Cavan Gas (intentionally left unset so failure is loud).
- Any change to `notifyAdmin.ts`.
