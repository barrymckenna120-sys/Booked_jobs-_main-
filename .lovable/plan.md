# BJ-B2 — read-only audit findings (no code changed)

## Findings table

| # | File | Hardcoded literal(s) + line | Per-tenant source available? | Send path |
|---|---|---|---|---|
| 1 | send-extrawork-payment-link | `"K & N Gas Services"` L71, `"087 3686252"` L72, K&N Stripe URL `https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c` L61 (payment_link fallback) | Name/phone: `tenant_integrations(360messenger).config.company_name/company_phone` — already read, literals are only fallbacks. Stripe link: NOT in 360messenger config for any org; real per-org value is `tenant_integrations(stripe).config.payment_link` (set for K&N + Dublin Gas only) | Raw 360messenger fetch L149; imports `_shared/whatsapp.ts` helpers (config/phone/failure log) but not a send helper |
| 2 | send-payment-received | `"K & N Gas Services"` L125 — unconditional, no lookup at all | Yes: `settings.business_name` (populated for 4 of 6 orgs) or 360messenger `company_name` | Raw fetch L132; `_shared/whatsappCredentials.ts` for key only |
| 3 | send-outstanding-invoice-reminders | `"K & N Gas Services"` L101 and `"K & N Gas Services ☎️ 087 368 5252"` L104 — unconditional; `DEFAULT_STRIPE_LINK` = K&N URL L17, used at L59 | Name/phone: `settings.business_name` / `business_phone`. Stripe: `cfg.stripe_payment_link` is **null for every org**, so every tenant currently falls back to K&N's live Stripe link. Correct source is `tenant_integrations(stripe).config.payment_link` | Raw fetch L112; credentials helper only |
| 4 | send-deposit-reminder | `"K & N Gas Services"` L81, `"087 3686252"` L82 (fallbacks) | Yes, 360messenger `company_name`/`company_phone` already read | Raw fetch L107 |
| 5 | send-quote-whatsapp | `"K&N Gas Services"` L88 (message_footer fallback) | `settings.message_footer` — read at L91. **Data problem: Cavan Gas's stored `message_footer` is literally "K&N Gas Services"**, so the DB value is also wrong. `business_name`/`business_phone` come from the request body (client-supplied), not the DB | Raw fetch L176 |
| 6 | send-certificate-whatsapp | `"K&N Gas Services"` L135 (footer fallback) | Same as #5 — `settings.message_footer`, same Cavan contamination | Raw fetch L228 |
| 7 | send-hazard-whatsapp | `"K&N Gas Services"` L103 (footer fallback) | Same as #5 | Raw fetch L162 |
| 8 | send-area-bulk-whatsapp | `"K & N Gas Services"` L113, `"087 3686252"` L114 (fallbacks) | 360messenger config read at L121-122. **Cavan Gas's `company_phone` is an empty string**, which is falsy → silently falls back to K&N's phone | Raw fetch L141 |
| 9 | trigger-outstanding-reminder | `"K & N Gas Services"` L103, `"087 3686252"` L104 (fallbacks) | 360messenger config already read; passes name/phone onward at L114 | Dispatcher — no direct send |
| 10 | generate-accountant-export | `"K & N Gas Services"` L246, `"087 3686252"` L247 — used in the export email subject/body L260-271 | 360messenger config read at L256-257; `settings` already queried at L103/L112 for other fields | Email (not WhatsApp). **`verify_jwt = true` confirmed** at `supabase/config.toml` L65-66 — auth untouched |
| 11 | _shared/depositLink.ts | `"K & N Gas Services"` L178, `"087 3686252"` L179; used in the deposit message L211 | 360messenger config read at L186-187 | Raw fetch L239. **Imported by `send-deposit-link` and `accept-quote` only** — one fix covers both, and both are on the live money path |

## What the audit changes vs the old table

Three issues the old audit would not have surfaced:

1. **Cross-tenant Stripe link (highest severity).** `send-outstanding-invoice-reminders` and `send-extrawork-payment-link` fall back to K&N's live Stripe payment link, and the field they read (`360messenger.config.stripe_payment_link`) is null for all six orgs — so every non-K&N tenant using these functions would be collecting money into K&N's Stripe account. Same class as the B1 `template_payment_link` bug, but worse: the fallback is a working URL, so it fails silently.
2. **Bad DB values, not just bad fallbacks.** Cavan Gas's `settings.message_footer` is "K&N Gas Services" and its `company_phone` is an empty string. Removing the code fallbacks alone does not fix items 5-8 for that tenant; the stored data needs correcting too.
3. **Two orgs have no settings row at all** (both "wexford gas" rows) — a skip-and-log path is needed, not a fallback.

## Proposed sequencing (for approval, no diffs yet)

- **B2a — money path first:** items 1, 3, 11 (Stripe link source + K&N literals). Highest blast radius, touches `accept-quote`/`send-deposit-link`.
- **B2b — messaging literals:** items 2, 4, 8, 9, plus the Cavan Gas data correction for footer/phone.
- **B2c — footer-only functions:** items 5, 6, 7.
- **B2d — split out separately as you suggested:** item 10 `generate-accountant-export`. It is post-F1 hardened with `verify_jwt = true`; it gets its own change with no auth or config.toml edits.

Verification per BJ-B1's rule: scratch jobs and test recipient numbers only, never a real customer's record.
