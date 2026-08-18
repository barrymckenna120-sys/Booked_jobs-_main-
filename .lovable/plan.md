# Decommission the legacy Stripe payment-confirm path

Retire `stripe-boiler-payment-confirm` and everything hanging off it. It has no frontend caller, no reachable log history, and every live payment now runs through the SumUp path. Nothing about SumUp, quotes, or invoicing changes.

## Ordered steps

### 1. Pre-flight: confirm nothing external still calls it (gate)
Before anything is deleted, add a temporary counter to the function — a single `edge_function_logs` row per request recording that it was hit, with no behaviour change — and leave it in place for an agreed observation window. If it records zero hits, proceed to step 2. If it records a hit, stop and report the caller before deleting anything.

This is the only safe substitute for the Make.com check, since `function_edge_logs` retention holds nothing for this function and the Make account can't be read from here.

Skip this step and go straight to deletion only if you tell me you've confirmed in Make directly that no scenario targets the URL.

### 2. Remove the function
- Delete `supabase/functions/stripe-boiler-payment-confirm/` .
- Remove its `[functions.stripe-boiler-payment-confirm] verify_jwt = false` block from `supabase/config.toml`.
- Undeploy the live function so the URL stops answering.

### 3. Remove the dangling secret
Delete `STRIPE_SECRET_KEY` — no code in the project reads it, so nothing can break.

`STRIPE_WEBHOOK_SECRET` goes too, since the only reader was the function being deleted. Both go in the same step; if you'd rather keep the webhook secret parked for a while, say so and I'll leave it.

Left untouched: `SUMUP_API_KEY`, `SUMUP_WEBHOOK_SECRET`, and the per-tenant SumUp secrets.

### 4. Clean the one stale test row
`KN-261` (K&N, customer "mike Brown", quote `Q-2026-0072`, notes "clock kit") is scratch data carrying a Stripe **test-mode** payment link and the only `payment_status = 'deposit_paid'` value in the database.

Reset that single row's payment fields back to unpaid — `payment_status` to `unpaid`, `deposit_paid` to `false`, `deposit_amount` and `balance_due` cleared, `payment_link` cleared — so no report or reminder can pick up a phantom deposit. Scoped by that job's id only, no bulk update.

### 5. Retire the orphaned status value
`'deposit_paid'` as a `payment_status` is written nowhere in the codebase once the function is gone (the live SumUp path writes `paid` / `partial`). After step 4 the value exists in zero rows. No code change is required — I'll just confirm the count is zero rather than edit any type or classifier, since nothing branches on that string.

### 6. Verify
- Grep: zero hits for `stripe-boiler-payment-confirm` and `STRIPE_SECRET_KEY` across the repo.
- Call the old function URL: expect a not-found response, not a 401/500.
- SQL: `count(*) where payment_status = 'deposit_paid'` returns 0.
- Open `KN-261` in Job Detail and confirm it reads "Unpaid" with no deposit pill and no payment link.
- Confirm a live K&N SumUp deposit still works end-to-end on a fresh scratch quote, and that Outstanding Balances and Sales Ledger totals are unchanged before/after.
- Run the existing test suite, including the `sumupWebhook` tests.

## Explicitly out of scope
- The remaining tenant Stripe payment links in `tenant_integrations` (K&N and Dublin Gas both still hold live `buy.stripe.com` links used by `send-invoice-whatsapp` and the reminder job). Those are the BJ-B2a surface and stay as they are unless you want them folded in.
- `service_calls.payment_link` as a column, and any other job's link value.
- The `invoices` table and the deposit/balance reconciliation work from the earlier audits.

## Technical notes
- The function verified an HMAC `stripe-signature` against `STRIPE_WEBHOOK_SECRET` with a 5-minute freshness window, so it was never anonymously writable — this is cleanup of dead surface, not an active-breach fix.
- It never read `STRIPE_SECRET_KEY`; that secret has no reader anywhere in the project.
- Correction to my audit note: the `"deposit_paid"` entry in `src/types/service-calls.ts` is the boolean **column** in the select list, not the status vocabulary. It stays.
- `KN-261` was not written by this function (its `paid_at` is null and there is no `payment_received` activity row, both of which the function always wrote), so cleaning it is unrelated to the undeploy and can be done independently.
