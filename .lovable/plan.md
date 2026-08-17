# Audit — moving the two Stripe-link functions onto SumUp

Read-only. Findings only, no diff. BJ-B2a is superseded by this scoping.

## 1. Reuse fit

Both functions can call `resolveSumUpCredentials` + `makeRestSumUpConfigLoader` **as-is**. The resolver takes only an org id and a config loader, has no deposit-specific logic, and already hard-fails with a machine-readable reason (`no_sumup_config_for_organisation`, `sumup_config_missing_merchant_code`, `sumup_config_missing_api_key`) — exactly the skip-and-log signal both functions need.

`createSumUpDepositCheckout` is *nearly* purpose-agnostic but not quite:

- `description` is already an optional arg defaulting to `"Deposit - Job Booking"` (sumupCheckout.ts L305) — each caller can pass its own label, so the SumUp dashboard stays readable. No code change needed for that.
- `checkout_reference` is `${serviceCallId}::${attemptNumber}` (L289) with **no purpose marker**. Attempt numbers are per-job across all purposes, so a job that had a deposit checkout then an invoice checkout produces `<uuid>::1` and `<uuid>::2` with nothing distinguishing them.

That matters because of the reuse guard (see §3) and the webhook (§2). A purpose is needed. Two options:

- **A — carry purpose in the reference**: `<uuid>::<attempt>::<purpose>`. Self-describing at the SumUp end, but the parser at sumupWebhook.ts L228 splits on the first `::` and the format is documented as permanently supporting exactly two shapes; a third shape widens a money-path parser.
- **B — carry purpose in `payment_checkout_attempts`** (recommended): add a `purpose` column, pass it through `SumUpDepositArgs`/`CheckoutAttemptStore.record`, and let the webhook read it from the attempt row it already looks up. Reference format untouched, parser untouched, and the reuse guard can filter on it.

Recommend B.

## 2. Webhook reconciliation

What happens today on a completed deposit checkout (`_shared/sumupWebhook.ts`):

1. Parse body, extract `checkout_id`. Find the job by stored `service_calls.sumup_checkout_id`, else fall back to parsing `checkout_reference` (both `<uuid>::<attempt>` and legacy bare `<uuid>` are permanently supported, L217-230); a reference matching no job is ignored.
2. Terminal FAILED / EXPIRED / CANCELLED -> `payment_failed` notification + `customer_activity` row, then `not_paid`. No job columns touched.
3. Idempotency layer 1: claim `sumup_webhook_events` by unique `checkout_id`; unclaimed re-delivery is a no-op.
4. Idempotency layer 2: any prior *claimed* event on the same job under a different checkout id -> duplicate no-op. Deliberately ignores `deposit_paid` / `payment_status`.
5. Success patch on `service_calls` only:
   - fully paid (`amount >= revenue`): `payment_status: "paid"`, `paid_at`, `deposit_paid: true`, `balance_due: 0`, `payment_method: "card"`
   - part paid: `payment_status: "partial"`, `paid_at`, `deposit_paid: true`, `balance_due: revenue - amount`, `payment_method: "card"`
   - `revenue` backfilled from the paid amount when the job has no total; `sumup_checkout_id` backfilled when matched by reference.
6. Then `logActivity`, `logMessage`, `notifyOffice`.

Consequences for the two new purposes:

- **It cannot tell the purposes apart today.** Everything keys off the job row; there is no purpose signal anywhere in the payload or the parsed reference.
- **`deposit_paid: true` is written unconditionally**, including on the fully-paid branch. An outstanding-invoice payment or an extra-work payment would stamp `deposit_paid` on a job that never took a deposit — wrong data feeding the deposit pills and the New Job wizard's deposit state.
- **Idempotency layer 2 actively breaks the invoice case.** A job that already took a deposit has a claimed event row; the later outstanding-invoice balance payment arrives under a different checkout id and is classified as a duplicate and **discarded**. This is the single biggest blocker: a real second payment on the same job is currently designed to be rejected.
- Extra-work payments never flip `quotes.status` to `Accepted`, and invoice payments never touch the `invoices` table or the `invoice_reminder_*` counters.

Minimum viable webhook change, once purpose is available from the attempt row:

| Purpose | Should set |
|---|---|
| `deposit` | unchanged (current behaviour) |
| `outstanding_invoice` | `payment_status` paid/partial, `paid_at`, `balance_due`, `payment_method: "card"` — **not** `deposit_paid`; consider marking the linked invoice paid |
| `extra_work` | same as invoice, plus flip the linked `quotes` row to accepted/paid |

And layer 2 must become purpose-and-amount aware rather than "any prior claimed event on this job", otherwise legitimate follow-on payments keep being swallowed. That is a change to live, tested webhook logic (46 existing tests) and is the riskiest part of this migration.

## 3. payment_checkout_attempts reuse guard in a batch context

`findReusableCheckout` is keyed on `(service_call_id, organisation_id)` and takes the newest attempt row. In `send-outstanding-invoice-reminders` each loop iteration is a different job, so the batch itself is safe — no cross-customer bleed, and per-job serial calls are fine.

Two real problems remain:

- **Cross-purpose reuse.** The guard matches only on latest-attempt + `PENDING` + amount equality. If a job's pending deposit checkout happens to be for the same amount as the outstanding balance, the reminder would hand the customer the *deposit* checkout. Adding `purpose` to the attempt row and filtering the `latest()` lookup on it fixes this, and is the second reason to prefer option B in §1.
- **Batch throughput.** Every iteration adds a `count`, a `latest`, and a SumUp `GET` before the `POST`, so roughly four extra round-trips per customer inside a single Edge Function invocation. With a large reminder batch this risks the function wall-clock limit. Needs either a per-run cap or chunking; worth measuring the current batch sizes before deciding.

Also worth noting: `send-extrawork-payment-link` currently reads `job.payment_link`, which `_shared/depositLink.ts` writes for deposits (depositLink.ts L168-176). Today an extra-work message can therefore send a customer the deposit link. Moving extra-work onto its own checkout removes that latent bug as a side effect.

## 4. Return URL / return flow

`buildSumUpReturnUrl` (sumupCheckout.ts L125-133) is **not** a customer-facing landing page — it is the secret-bearing `sumup-payment-webhook?s=<SUMUP_WEBHOOK_SECRET>` callback, because SumUp has no account-level webhook setting and the subscription rides on each checkout. It carries no deposit-specific content and is reusable verbatim for both new purposes; no change needed.

It returns `null` when `SUPABASE_URL` or `SUMUP_WEBHOOK_SECRET` is missing, and `createSumUpDepositCheckout` then omits `return_url` entirely — creating a checkout that can **never** be confirmed. `depositLink.ts` only `console.error`s in that case (L130-135). Both new callers should treat a null return URL as a hard skip-and-log rather than proceeding, and the deposit path arguably should too (separate ticket).

There is no post-payment customer landing page anywhere in the current flow — the customer just sees SumUp's own confirmation. That is the same experience for all three purposes, so nothing new is required, but if a branded thank-you page is wanted it is new work, not part of this migration.

## 5. K&N behaviour

K&N's row (`merchant_code MBBMEYG7`, `api_key_secret: SUMUP_API_KEY`, `SUMUP_API_KEY` present in secrets) satisfies the resolver with **no additional config** — the resolver is purpose-blind. So yes, K&N works immediately for both functions on the credential side.

One caveat, unverified: I have not confirmed whether K&N's row points at sandbox or live credentials. Earlier in this project a K&N SumUp deposit went missing precisely because the integration was on `sandbox`. Confirming which environment `SUMUP_API_KEY` currently holds should be step one of the build, before any live-path check.

Every other tenant (Dublin Gas, Cavan Gas, Webliveview, both Wexford orgs) has no `sumup` row and gets a clean skip-and-log — the acceptance criterion is met by the resolver's existing no-global-fallback design, no new guard needed.

## 6. Blast radius

| File | Reason |
|---|---|
| `_shared/sumupCheckout.ts` | Add `purpose` to args, thread it into `CheckoutAttemptStore.record` and the `latest()` reuse filter |
| `_shared/sumupWebhook.ts` | Read purpose from the attempt row; branch the success patch per purpose; make idempotency layer 2 purpose-aware so follow-on payments are not discarded |
| `sumup-payment-webhook/index.ts` | Supply the new attempt-row lookup dependency to the shared module |
| `send-outstanding-invoice-reminders/index.ts` | Replace `DEFAULT_STRIPE_LINK` and the config link with a per-job SumUp checkout; add `settings`-sourced name/phone and skip-and-log |
| `send-extrawork-payment-link/index.ts` | Same, plus stop reusing `job.payment_link` as the payment source |
| Migration: `payment_checkout_attempts` | Add nullable `purpose` column (existing rows read as `deposit`) |
| `_shared/sumupCheckout.test.ts`, `_shared/sumupWebhook.test.ts` | Extend the 46 existing money-path tests to cover the new purposes and the revised layer-2 rule |
| `_shared/depositLink.ts` | Pass `purpose: "deposit"` explicitly so the deposit path is not the implicit default |

Not touched: `config.toml`, `accept-quote`, `send-deposit-link`, `send-payment-link` (beyond the shared-module signature), any UI.

## Recommendation before a diff

This is a bigger change than B2a was, and the highest-risk piece is not the two functions — it is making webhook idempotency layer 2 purpose-aware, since today it is designed to reject a second payment on the same job. Suggest splitting into two shippable steps:

1. **Purpose plumbing**: `purpose` column + shared-module threading + webhook branch and revised layer 2, with tests, no caller behaviour change (everything stays `deposit`).
2. **Cut the two functions over** to SumUp once the webhook can reconcile them correctly.

Also still open from earlier: whether the K&N Stripe fallbacks should be removed *now* as an interim safety fix, since this migration will take longer than a one-line deletion and until it lands every non-K&N tenant using those two functions still points at K&N's live Stripe link.
