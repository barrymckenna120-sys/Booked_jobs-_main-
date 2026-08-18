# BJ-B3g: Delete `stripe-boiler-payment-confirm`

Single concern: remove the dead legacy Stripe webhook function and stop the live URL answering. Make.com has been confirmed clear, so no observation gate.

## Steps

1. Delete `supabase/functions/stripe-boiler-payment-confirm/` entirely.
2. Remove the `[functions.stripe-boiler-payment-confirm] verify_jwt = false` block from `supabase/config.toml`.
3. Undeploy the live function so the URL stops answering.
4. Search the frontend for any remaining reference to the function name or URL and remove it. Based on the audit there are none — if the search confirms that, I'll say so explicitly rather than touch anything.

## Explicitly not in scope

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stay exactly as they are.
- `KN-261` stays untouched, including its `payment_status = 'deposit_paid'`, `deposit_paid`, `deposit_amount`, `balance_due`, and `payment_link` values.
- No other row, table, migration, or Edge Function is modified.

## Verification (raw evidence pasted back, not self-report)

1. Deployed function list, showing `stripe-boiler-payment-confirm` absent.
2. Repo-wide grep for `stripe-boiler-payment-confirm` — expect zero hits outside this deletion's own diff.
3. Direct call to the old function URL, raw response body and status pasted — expect not-found, not 401/500.
4. `SELECT count(*) FROM service_calls WHERE payment_status = 'deposit_paid'` — expect **1**, confirming KN-261 was untouched.
5. Live K&N SumUp deposit end-to-end on a **fresh scratch quote** (never a real customer), plus Outstanding Balances and Sales Ledger totals captured before and after to confirm they are unchanged.
