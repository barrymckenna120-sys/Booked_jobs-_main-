# SumUp checkout attempt status write-back (Steps 2 + 3)

## What this does
After the Step 1 migration adds a unique index on `payment_checkout_attempts.checkout_id`, these two small changes make the payment path use and tolerate that index.

## Changes

### 1. `supabase/functions/sumup-payment-webhook/index.ts` — write resolved status back to `payment_checkout_attempts`

- Near the top of the `Deno.serve` handler, derive two variables using the same env values already used to create the Supabase client:
  - `supabaseUrl` from `SUPABASE_URL`
  - `headers` map with `apikey` and `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- Extend the `notifyOffice` callback so it receives the checkout id and resolved status (this requires a 2-line interface/call-site change in `_shared/sumupWebhook.ts` described below). `notifyPaymentFailed` already has both values.
- Immediately alongside the existing `notifyOffice` and `notifyPaymentFailed` calls, insert the provided write-back block:
  - PATCH `payment_checkout_attempts?checkout_id=eq.<checkoutId>`
  - body: `{ status: <resolvedStatus>, updated_at: <ISO timestamp> }`
  - wrapped in `try/catch`, logging and continuing on failure so the webhook response is never blocked.

### 2. `supabase/functions/_shared/sumupWebhook.ts` — pass checkout id + status to `notifyOffice`

- Add `checkoutId: string` and `status: string` to the `notifyOffice` dependency interface.
- Pass `checkoutId` and `status` at the single `notifyOffice` call site.

### 3. `supabase/functions/_shared/sumupCheckout.ts` — tolerate duplicate checkout_id inserts

- In `restAttemptStore.record()`, after the POST to `payment_checkout_attempts`, inspect the response.
- If PostgREST returns a 409/23505 unique-violation, log a warning and return normally (matching the existing `notifications_payment_failed_once` 23505-as-success pattern).
- Other non-ok responses are logged as errors but still do not throw, preserving the current "checkout creation must never fail because of tracking" rule.

## Out of scope
No other refactors, style changes, or unrelated fixes. No frontend changes. No new migrations (Step 1 is assumed applied separately).

## Verification
- Run the existing Deno unit tests for `_shared/sumupWebhook.ts` and `_shared/sumupCheckout.ts`.
- Show the full diff before deploying.
- Deploy only after you confirm the diff looks correct.
