# BJ-0110 — Handler-level test for payment bell alerts

Close the tested-code gap found during verification: the tiered recipient resolver has unit tests, but the code that actually writes the notification row lives in un-exported closures inside the webhook entrypoint, so nothing tests the dedupe read, the profile lookup, or the insert.

## What changes

Move the two alert-delivery closures out of the webhook entrypoint into a shared module, then test them against a fake database client. Pure move — the running webhook behaves identically.

## Step 1 — Extract to `_shared/paymentAlertDelivery.ts`

Two exported functions, lifted verbatim from `sumup-payment-webhook/index.ts`:

- `deliverPaymentAlert({ supabase, event, recordAttemptStatus })` — from `notifyOffice` (lines 606-710)
- `deliverPaymentFailedAlert({ supabase, event, recordAttemptStatus })` — from `notifyPaymentFailed` (lines 714-821)

Everything is preserved exactly: the checkout-keyed dedupe read, the `is_active` profile query, `resolveAlertRecipients` tiering, the `PAYMENT_ALERT_NO_RECIPIENTS` error log, the non-office tier log, the customer-name lookup, `buildPaymentAlert` copy, the failure-path `23505` race handling, and the `try/catch` that swallows errors so an alert failure never fails a real payment.

One necessary addition to the scoped signature: both closures call `recordAttemptStatus`, a helper in `index.ts` that PATCHes `payment_checkout_attempts` over REST using the service-role headers. It is passed in as a third dependency rather than moved, so the fake client does not need to intercept `fetch`.

In `index.ts` the two closures become one-line delegations to the new functions, keeping the existing `notifyOffice` / `notifyPaymentFailed` dependency wiring into `handleSumUpWebhook` untouched.

## Step 2 — Chainable fake client in `_shared/paymentAlertDelivery.test.ts`

Extends the `{ from: () => ({ ... }) }` pattern already used in `auditLog.test.ts` so it supports what this code actually calls:

```text
from("notifications").select().eq().eq().eq().limit()   -> dedupe read
from("profiles").select().eq().eq()                     -> active staff
from("customers").select().eq().maybeSingle()            -> customer name
from("notifications").insert(rows)                      -> captured
```

Each terminal call resolves to a seeded `{ data, error }`; inserts are captured for assertion. `console.error` / `console.log` are captured to assert on log lines.

## Step 3 — The three tests, for both the paid and failed variants

1. **No office/admin** (superadmin + engineer, one ops-flagged) — exactly one row inserted, recipient is the ops-flagged user, `role: "office"`, metadata carries `checkout_id`; the routed-to-`ops_flag` line is logged; `handleSumUpWebhook` still returns outcome `paid` (`failed` for the failure variant), asserted through the existing harness in `sumupWebhook.test.ts` with the real deliverer wired in.
2. **Every tier empty** — zero inserts, `PAYMENT_ALERT_NO_RECIPIENTS` logged with kind/job/checkout/org, outcome still returned correctly.
3. **Office/admin present** — regression guard: recipients are exactly the office/admin users, no ops-flag or superadmin leakage, no tier-routing log. Proves the refactor did not alter the working path.

Plus dedupe coverage: a pre-existing notification for the same checkout inserts nothing (and, on the paid path, still records attempt status).

## Step 4 — Verify and deploy

- Run the full `_shared` Deno suite; the existing SumUp webhook tests must stay green (currently 218 passing).
- `deno check` both touched files.
- Redeploy `sumup-payment-webhook` explicitly.

## Reported back

Test file diff, the three new test results, full suite pass count, and deploy confirmation — pasted output, no claims without it.

## Not in scope

No behaviour change, no schema change, no new notification types, and no retry of the blocked live sandbox success payment (still open separately).
