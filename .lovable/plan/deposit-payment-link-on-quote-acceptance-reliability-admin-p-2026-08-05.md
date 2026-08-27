# Deposit payment link on quote acceptance — reliability + admin path

Two independent defects found in the audit, both fixed here.

## Problem 1 — the deposit send gets cut off

In `accept-quote`, the deposit link work (Stripe price → payment link → save to job → WhatsApp → message log) is started but not awaited. The HTTP response returns immediately, the function isolate shuts down, and the pending work dies partway. Confirmed live: the "called" log line appears, then `shutdown` ~300ms later with no Stripe or send-result line and no `message_log` row. Older acceptances did complete, so it fails intermittently depending on Stripe/WhatsApp latency.

**Fix:** keep the fast response but let the background work finish, using the platform's background-task mechanism (`EdgeRuntime.waitUntil`) with an await fallback if unavailable. Add a completion log line either way so a partial run is visible in logs.

## Problem 2 — staff "Mark Accepted" never sends a deposit link

The public customer approval page goes through `accept-quote` (which handles the deposit link). The staff path in the quote detail screen calls the acceptance database function directly, then only fires the office alert — so no Stripe link is created, `payment_link` stays empty on the new job, no deposit WhatsApp goes out, and the daily deposit reminder never picks the job up (it requires a `payment_link`).

**Fix:** route the staff accept through the same `accept-quote` function so both paths share one code path, keeping the existing success toast and cache invalidation. The acceptance database function is already idempotent on a used token, so no double-processing.

## Guardrails kept as-is

All existing skip conditions stay: no deposit amount, no converted job, customer opted out, no phone, no Stripe key, no tenant WhatsApp key. Failures continue to log to `message_log` and `edge_function_logs` rather than blocking acceptance.

## Verification

- Accept a test quote with a deposit from the public page: confirm log shows Stripe link generated + send result, `service_calls.payment_link` populated, `message_log` row moves to `sent`.
- Accept a test quote with a deposit from the staff quote screen: same three checks, plus job created once with no duplicate.
- Accept a quote with zero deposit: confirm clean skip, no Stripe call, no message row.
- Accept for an opted-out customer: confirm skip and no WhatsApp.
- Clean up all test quotes, jobs, and message rows afterwards.

## Technical notes

- `supabase/functions/accept-quote/index.ts`: wrap the `sendDepositPaymentWhatsApp` invocation in `EdgeRuntime.waitUntil(...)` (guarded, fallback to `await`), keep the `.catch` handler, and add a terminal log line.
- `src/pages/QuoteDetail.tsx` (`respondToQuote`): on accept, invoke the `accept-quote` function with `quote_id` + `access_token` instead of calling the RPC directly; rejection keeps using the RPC. Surface a non-blocking warning toast if the deposit step reports failure.
- No database migration, no schema change, no change to the acceptance database function.
