# BJ-B2a — Remove the K&N Stripe and branding fallbacks (implementation)

Narrow safety fix. Two files only. No replacement payment source, no SumUp, no webhook or `config.toml` changes — the SumUp migration stays a separate task.

Confirmed understood, not a bug: with no payment-link source left, **both functions will skip for every tenant including K&N** until the SumUp migration lands. `tenant_integrations(360messenger).config.stripe_payment_link` is null for every org, and `send-extrawork-payment-link` only has a link when `service_calls.payment_link` happens to be populated. That is the intended posture — no tenant can route a customer payment into K&N's Stripe account.

## send-outstanding-invoice-reminders/index.ts

- Delete `DEFAULT_STRIPE_LINK` (L17) and the `|| DEFAULT_STRIPE_LINK` fallback (L59). `cfg.stripe_payment_link` becomes the only source.
- Add a per-org `settings` read (`business_name, business_phone`) alongside the existing `tenant_integrations` read.
- Pre-flight guard **before** the send loop — batch job, so a missing tenant value stops the whole run. Each check inserts an `edge_function_logs` row and returns `{ success: true, skipped: true, reason, sent: 0 }`:
  - no payment link -> `payment_link_not_configured`
  - blank `business_name` -> `business_name_not_configured`
  - blank `business_phone` -> `business_phone_not_configured`
  Blank means null, empty or whitespace (`?.trim() || ""`), so Cavan Gas's empty-string `company_phone` equivalent is caught.
- Replace the two literals in the message body (L101, L104) with `businessName` / `businessPhone`. Wording, the `☎️` glyph, spacing, date and balance formatting all unchanged.
- Untouched: reminder windows and filters, `invoice_reminder_count` / `invoice_reminder_sent_at` / `invoice_reminder_2_sent_at`, the `log-message` payload, the 360Messenger call. Guards return before the loop so no counter moves on a skip.

## send-extrawork-payment-link/index.ts

- Delete the hardcoded Stripe URL fallback (L61) — `const paymentLink = job?.payment_link` only.
- Replace the two `??` K&N literals (L71-72) with a `settings` read for the job's org using `?.trim() || ""`. Drop the `360messenger` `company_name` / `company_phone` secondary source entirely — one source of truth.
- Skip-and-log per request, placed **before** the message is built, before the `message_log` insert, and before the quote status flip to `Sent`. Each inserts an `edge_function_logs` row and returns HTTP 200 with `{ success: false, whatsapp_sent: false, skipped: true, reason }`:
  - `payment_link_not_configured`
  - `business_name_not_configured`
  - `business_phone_not_configured`
- Untouched: opt-out and phone checks, `getWhatsAppConfig` / `logWhatsAppFailure`, the `message_log` lifecycle on real sends, the quote status update, the `customer_activity` insert.

## Verification — scratch jobs and test recipients only, no real customer sends

1. Static: grep both files for `buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c`, `K & N Gas Services`, `087 368 5252` and `087 3686252` — expect zero hits.
2. Cavan Gas scratch job: call each function, paste the raw JSON response and the raw `edge_function_logs` row proving the skip.
3. K&N scratch job: call each function, confirm it also skips cleanly, paste the same evidence.
4. Confirm zero `message_log` rows and no `quotes.status` change resulted from any skipped call.
5. Delete the scratch records afterwards and show the post-cleanup counts.

## Still open, separate tasks

- Critical: migrate both functions onto SumUp hosted checkout (purpose plumbing first — the webhook's idempotency layer 2 currently discards a second payment on the same job).
- Critical: SumUp merchant-code fields in `CustomerIntegrationsTab.tsx`.
- Low: remove the stale `[functions.create-sumup-checkout]` entry from `config.toml`.
