# BJ-B2a — Remove K&N fallbacks from the two Stripe-link functions (diff proposal)

Read-only. Nothing implemented yet. Two files only: `send-outstanding-invoice-reminders`, `send-extrawork-payment-link`. No `config.toml`, no SumUp, no webhook or `payment_checkout_attempts` changes.

## Current state (confirmed by reading both files)

`send-outstanding-invoice-reminders/index.ts`

- L17: `const DEFAULT_STRIPE_LINK = "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c"` — K&N's live link.
- L59: `const stripeLink = cfg.stripe_payment_link || DEFAULT_STRIPE_LINK` — `cfg` is the `360messenger` config, and `stripe_payment_link` is null for every tenant, so every org falls through to K&N's link.
- L101 and L104: `K & N Gas Services` and `☎️ 087 368 5252` written as literals directly into the message body — not fallbacks at all, no tenant lookup exists in this function.
- Reminder counters (`invoice_reminder_count`, `invoice_reminder_sent_at`, `invoice_reminder_2_sent_at`) only advance on a successful send (L143-154).

`send-extrawork-payment-link/index.ts`

- L61: `const paymentLink = job?.payment_link || "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c"` — same K&N link. Note the job's own `payment_link` is the primary source and is often populated by the SumUp path, so the fallback only fires when the job has no link.
- L71-72: `company_name ?? "K & N Gas Services"` and `company_phone ?? "087 3686252"` from the `360messenger` config. Cavan Gas has an empty-string `company_phone`, which `??` does not catch, so it renders a blank phone; other orgs have no value and get K&N's.

Available tenant source: `public.settings` has `business_name`, `business_phone` (also legacy `company_name`, `company_phone`, `message_footer`). B1 used `settings.business_name` / `settings.business_phone` with an `edge_function_logs` skip-and-log, which is the pattern to repeat.

## Proposed diff — send-outstanding-invoice-reminders

1. Delete `DEFAULT_STRIPE_LINK` (L17) and the `|| DEFAULT_STRIPE_LINK` fallback (L59). Keep reading `stripe_payment_link` from the existing config as the only source.
2. Add a per-org `settings` read alongside the existing integration read: `business_name, business_phone`.
3. Pre-flight guard before the send loop — three independent checks, each skipping the whole run (this function is a batch job, so a missing tenant value means no message should go out at all):
   - no payment link -> insert into `edge_function_logs` and return `{ success: true, skipped: true, reason: "payment_link_not_configured", sent: 0 }`
   - blank `business_name` -> `reason: "business_name_not_configured"`
   - blank `business_phone` -> `reason: "business_phone_not_configured"`
   Blank means null, empty, or whitespace-only (`?.trim() || ""`), so Cavan Gas's empty string is caught.
4. Replace the two message literals with `businessName` and `businessPhone`. Message wording, the `☎️` glyph, the emoji spacing and the invoice-date/balance formatting all stay byte-identical apart from the substituted values.
5. Counters, reminder windows, filters, `log-message` payload and 360Messenger call unchanged. Skipping returns before the loop, so nothing increments.

## Proposed diff — send-extrawork-payment-link

1. Delete the hardcoded Stripe URL at L61: `const paymentLink = job?.payment_link` only.
2. Replace the two `??` K&N literals (L71-72) with a `settings` read for the job's org, using `?.trim() || ""` so empty strings are treated as missing. The `360messenger` `company_name` / `company_phone` read can stay as a secondary source ahead of the skip, or be dropped — recommend dropping it so there is one source of truth; flag which you prefer.
3. Skip-and-log before any message is built or logged, per-request (this function is single-send):
   - no `paymentLink` -> `edge_function_logs` row + `{ success: false, whatsapp_sent: false, skipped: true, reason: "payment_link_not_configured" }` at status 200
   - blank business name or phone -> same shape with `business_name_not_configured` / `business_phone_not_configured`
   Guards run before the `message_log` insert (L132) so a skip leaves no pending row, and before the quote status flip to `Sent` (L191) so a skipped quote is not falsely marked sent.
4. Message template text unchanged; only the interpolated values change.
5. Untouched: opt-out and phone checks, `getWhatsAppConfig` / `logWhatsAppFailure`, `message_log` lifecycle, quote status update, `customer_activity` insert.

## Behaviour after the change

| Tenant | Before | After |
|---|---|---|
| K&N | works, K&N link | unchanged only if `settings` and a Stripe link are populated for K&N — needs checking before rollout, since `stripe_payment_link` is currently null everywhere |
| Cavan Gas | would send with K&N's link and a blank phone | clean skip, logged reason |
| Dublin Gas / others | would send with K&N's link | clean skip, logged reason |

Consequence to accept explicitly: with `stripe_payment_link` null across the board, **both functions skip for every tenant including K&N** until a link is configured. That is the intended safety posture of "remove fallback only, decide rail later" — no money can be routed to K&N from another tenant — but it does mean outstanding-invoice reminders and extra-work links stop sending until the rail decision lands. Confirm that is acceptable, or say the word and I will include a K&N-only `settings` / config population step so K&N keeps working while the others skip.

## Verification (on approval, no live customer sends)

- Static: confirm zero remaining occurrences of `buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c`, `K & N Gas Services` and the two phone literals in both files.
- Scratch-job only, per the live-path rule: call each function against a test job on a non-K&N org and paste the raw JSON plus the raw `edge_function_logs` row proving the skip. No real customer message.
- Confirm no `message_log` row and no quote status change is created by a skipped extra-work call.

## Also registered, not in this task

- Low: remove the stale `[functions.create-sumup-checkout]` declaration from `config.toml`.
- Critical: SumUp merchant-code fields in `CustomerIntegrationsTab.tsx` — blocks tenant 3 payment readiness, needs its own scoping (fields, validation, whether it test-connects to SumUp).
