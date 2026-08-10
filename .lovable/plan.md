# SumUp payment confirmation webhook

Right now SumUp checkouts are created and the link is sent, but nothing ever tells the system a payment succeeded. That's why a completed sandbox payment never appeared on the daily financial report — the report keys off a "paid" flag that only manual actions and the Stripe webhook currently set.

This adds the missing inbound half: an endpoint SumUp calls when a checkout is paid or fails, which updates the job's payment state so finance screens pick it up.

## What gets built

New Edge Function `sumup-payment-webhook` plus a shared, unit-tested handler module so the money logic can be tested without a live callback.

### Authenticity (never trust the callback body)

SumUp does not provide a reliable HMAC signature header on checkout events, so the plan uses two layers instead of trusting the payload:

1. **Secret in the URL** — the registered webhook URL carries an unguessable token that must match a stored secret. Requests without it are rejected with 401 and logged.
2. **Re-fetch from SumUp (authoritative)** — the body is treated as a *hint only*. The handler takes the checkout id from the payload and calls SumUp's `GET /v0.1/checkouts/{id}` using that organisation's own credentials, and only trusts the amount, status and `checkout_reference` returned by SumUp. A forged body therefore cannot mark anything paid.

If the re-fetch fails, nothing is written and the function returns a retryable 5xx.

### Matching and unknown references

- `checkout_reference` maps to `service_calls.id`.
- No match, or a match belonging to a different organisation than the credentials used: **no write**, an explicit error-level log plus a row in the debug/error log table with the checkout id and reference, and a `200` returned so SumUp stops retrying a reference we will never recognise. Never silent.

### Idempotency

- The handler first reads the job's current payment state.
- If the job is already `paid` (or the deposit is already recorded) for this checkout id, it exits as a no-op: `paid_at` is never overwritten and no second activity-log entry is written.
- The update is written conditionally (guarded on the current state) so two simultaneous deliveries cannot both apply.

### State transitions

| SumUp status | Amount vs job total | Result |
| --- | --- | --- |
| PAID | covers full balance | `payment_status = 'paid'`, `paid_at` set once, `balance_due = 0`, `deposit_paid = true` |
| PAID | deposit only (less than total) | `payment_status = 'part_paid'`, `deposit_paid = true`, `balance_due` reduced, `paid_at` left unset |
| FAILED / EXPIRED | — | payment state left as unpaid, failure recorded in the log only |
| any | no matching reference | no write, logged loudly |

Each successful transition also writes one `message_log` entry and one `customer_activity` entry so the payment shows in the customer timeline.

## Tests (written first)

Deno tests against the shared handler with an injected fetch and an injected data layer:

1. Full payment marks the job paid, sets `paid_at`, zeroes the balance.
2. Deposit/partial payment sets `part_paid` + `deposit_paid` and leaves `paid_at` unset.
3. Failed/expired checkout writes no payment state.
4. Unknown `checkout_reference` writes nothing and returns a logged, explicit not-found outcome.
5. Duplicate delivery of the same paid event is a no-op — one `paid_at`, one activity entry.
6. Missing/incorrect URL secret is rejected before any SumUp or DB call.
7. Forged body whose SumUp re-fetch shows an unpaid checkout writes nothing.

## Live verification (after build)

1. Generate the webhook secret and register the full URL in SumUp for K&N's account.
2. Create a test job, generate a SumUp checkout link, complete a sandbox payment.
3. Confirm in the database that the job flipped to paid/part-paid with `paid_at` set, and confirm the payment appears on the daily financial report.
4. Re-deliver the same event to prove idempotency, and send one bogus reference to prove it logs rather than fails silently.

Step 2's card payment needs your sandbox card on SumUp's hosted page — I'll drive everything either side of it and read the results back from the database and logs.

## Technical notes

- Handler logic in `supabase/functions/_shared/sumupWebhook.ts` (pure, injected deps); thin HTTP wrapper in `supabase/functions/sumup-payment-webhook/index.ts`.
- Credentials resolved per organisation via the existing `_shared/sumupCredentials.ts` — no global fallback, so a checkout is only ever verified against the owning tenant's account.
- Function runs without JWT verification (external caller) — auth is the URL secret plus the SumUp re-fetch.
- New secret for the URL token; no schema change required (existing `service_calls` payment columns are sufficient). A dedicated payments table is deliberately out of scope.
- `_shared/sumupCheckout.ts` gains an optional `return_url`/webhook registration only if SumUp requires per-checkout registration rather than an account-level webhook; confirmed during build.
