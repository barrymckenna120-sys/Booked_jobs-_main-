# SumUp discovery (read-only) — it exists and it is live

Headline: SumUp is **built and in production use for quote deposits**. The tracked state ("scoped, not yet built, queued") is stale. It also corrects my own B2 audit line: quote deposits go through **SumUp hosted checkout**, not Stripe. Stripe survives only in the older reminder/invoice functions.

## 1. Secrets

Present in project secrets:

- `SUMUP_API_KEY`
- `SUMUP_WEBHOOK_SECRET`

No OAuth client id/secret, no merchant-id secret. Merchant code lives in the database, not in secrets.

## 2. tenant_integrations

Exactly one `integration_type = 'sumup'` row, K&N Gas Services (updated 06/08/26):

| field | value |
|---|---|
| merchant_code | `MBBMEYG7` |
| api_key | not stored inline |
| api_key_secret | `SUMUP_API_KEY` |

No SumUp row for Dublin Gas, Cavan Gas, Webliveview or either wexford gas org. Per the resolver's no-global-fallback rule, those tenants get a clean skip, not a mis-routed payment.

## 3. Edge Functions and shared modules

| File | Role |
|---|---|
| `_shared/sumupCredentials.ts` | Per-org credential resolver; inline `api_key` or `api_key_secret` env lookup; hard fail on missing config, no global fallback (L1-17, L43-80) |
| `_shared/sumupCheckout.ts` | Hosted-checkout creation, `buildSumUpReturnUrl`, attempt numbering via `payment_checkout_attempts`, reuse guard |
| `_shared/sumupWebhook.ts` | All webhook decision logic: verified-evidence idempotency, terminal FAILED/EXPIRED/CANCELLED handling |
| `_shared/depositLink.ts` | The quote-deposit path — resolves creds (L110-122), builds return URL (L126-135), creates checkout (L136-148), writes `payment_link` + `sumup_checkout_id` back to the job (L168-176), then WhatsApps the link |
| `sumup-payment-webhook/index.ts` | Thin HTTP/DB adapter over the shared webhook module; registered as `…/sumup-payment-webhook?s=<SUMUP_WEBHOOK_SECRET>` |
| `send-payment-link/index.ts` | Balance-payment SumUp checkout (L68-140), same resolver |
| `send-deposit-link/index.ts` | `verify_jwt = true`, org-checked wrapper that calls `sendDepositLink` |
| `accept-quote/index.ts` | Resolves org then calls `sendDepositLink` (L213, L227) |

Loose end: `supabase/config.toml` L47-48 declares `[functions.create-sumup-checkout]` but **no such function directory exists** — a stale config entry.

Migrations touching SumUp: `20260325175258` (adds `service_calls.sumup_checkout_id`), `20260811164747` (creates `sumup_webhook_events` + RLS/grants), `20260813183314` (duplicate-delivery index), plus two one-off data migrations.

## 4. Admin panel UI

**No SumUp UI exists.** The only `src/` matches are the temporary RLS debug block in `AdminPanel.tsx` (L280, L343, L805) and comments in `NewJobPanel.tsx`, `SalesLedger.tsx`, `OutstandingBalances.tsx`. `CustomerIntegrationsTab.tsx` has sections for Tally, Stripe, 360Messenger, Make and business details — **no SumUp fields**. Onboarding a tenant's merchant code today requires a direct database write, which is the real gap.

## 5. Quote deposit flow as it stands

`accept-quote` (or `send-deposit-link`, or the New Job wizard toggle) → `_shared/depositLink.ts` → per-org SumUp credentials → hosted checkout with a secret-bearing webhook return URL → `payment_link` + `sumup_checkout_id` saved on the job → WhatsApp send → `sumup-payment-webhook` confirms and flips payment state.

No feature flag, no Stripe alternative branch, no half-built parallel path on this flow.

Live evidence: 21 jobs carry a `sumup_checkout_id`, 10 rows in `payment_checkout_attempts` (latest 17/08/26 13:17), 5 rows in `sumup_webhook_events` (latest 17/08/26 13:18).

## What this means for B2a

B2a as I scoped it is wrong and should be re-cut. The `tenant_integrations(stripe).config.payment_link` work does **not** apply to quote deposits — that path is SumUp and already per-tenant. The Stripe-link problem is confined to `send-outstanding-invoice-reminders` (K&N link as `DEFAULT_STRIPE_LINK`) and `send-extrawork-payment-link` (K&N URL as `payment_link` fallback). Those two are the real money-path items; `_shared/depositLink.ts` only needs the K&N name/phone literals removed.

Proposed next step, for your call: re-cut B2a to those two functions plus a decision on whether the two extra-work/reminder paths should move onto SumUp like the deposit path, rather than keeping a per-tenant Stripe link at all. Also worth logging separately: the missing SumUp fields in the admin integrations tab, and the stale `create-sumup-checkout` config entry.
