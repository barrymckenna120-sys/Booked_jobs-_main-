# SumUp merchant setup in the admin Integrations tab

B2a is closed and verified. Per your call, reminders and extra-work links stay in skip mode until a payment-link source exists — no further work there for now.

Next task (registered as Critical earlier): tenant SumUp onboarding currently requires a direct database write, because the admin Integrations tab has no SumUp fields. This plan adds them so a new tenant can be set up from the UI.

## What you'll be able to do

In Admin → Customer Integrations, pick a tenant and fill in a new **SumUp (Deposits & Payments)** section:

- **Merchant Code** — e.g. `MBBMEYG7`, from the tenant's own SumUp account
- **API Key Secret Name** — the *name* of the backend secret holding that tenant's SumUp key (e.g. `SUMUP_API_KEY_KN_GAS`), never the key value itself

Saving writes these to the tenant's own SumUp integration record. The existing per-tenant credential resolver already reads exactly this shape, so a correctly filled tenant starts working with no code change; a tenant left blank keeps failing safe (hard error, never another tenant's account).

## Guardrails

- The API key value is never entered or stored in the app — the field takes a secret *name*, matching how 360Messenger is already handled on this screen. The key itself is added separately in Backend → Secrets.
- The Merchant Code field shows the saved value; the secret-name field follows the existing masked/reveal behaviour used for secret fields.
- No change to how checkouts are created, to the webhook, or to K&N's live config. K&N's existing record is left exactly as it is.
- Saving merges into the existing record rather than replacing it, so any fields not shown on this screen are preserved.

## Separate issue found while checking this (not fixed here)

There is a mismatch on the Stripe side of this same screen: the tab saves the Stripe link as `payment_link_url` on the tenant's **stripe** record, but `send-outstanding-invoice-reminders` reads `stripe_payment_link` from the tenant's **360messenger** record. So a link typed into the current UI would never be picked up by the reminder job. This is consistent with your decision to leave both functions skipping, and it disappears once those functions move to SumUp — flagging it so it isn't mistaken for a UI bug later. Say the word if you want it registered as its own task.

## Technical detail

- `src/components/admin/CustomerIntegrationsTab.tsx`: add a `SECTIONS` entry `title: "SumUp (Deposits & Payments)"` with two fields, both `type: "sumup"`:
  - `{ key: "merchant_code", label: "SumUp Merchant Code", placeholder: "MBBMEYG7" }`
  - `{ key: "api_key_secret", label: "SumUp API Key Secret Name", secret: true, placeholder: "SUMUP_API_KEY_KN_GAS", help: ... }`
- No other file changes. The tab's existing load (`select integration_type, config`) and save (`upsert` on `organisation_id,integration_type` with a per-type config merge) already handle a new `integration_type` generically, so `sumup` rows are created and merged with no logic changes.
- Field keys deliberately match `supabase/functions/_shared/sumupCredentials.ts` (`merchant_code`, `api_key_secret`). The resolver's inline `api_key` variant is intentionally not exposed in the UI.
- No database migration; `tenant_integrations` already stores arbitrary `config` JSON per type.

## Verification

- Load the tab for K&N and confirm the SumUp section shows their existing merchant code and secret name unchanged (read-only proof the field keys match the live record).
- Save a merchant code for a non-K&N tenant, re-read the row, and confirm only the SumUp record changed and K&N's row is untouched.
- No live payment or checkout calls in verification.
