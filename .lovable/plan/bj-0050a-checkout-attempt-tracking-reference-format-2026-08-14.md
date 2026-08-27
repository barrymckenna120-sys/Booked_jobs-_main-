# BJ-0050a — Checkout attempt tracking + reference format

Single concern: record every SumUp checkout we create, and make the checkout reference carry an attempt number. No guard logic changes anywhere (that is 0050b).

## 1. New table (migration)

`public.payment_checkout_attempts` exactly as scoped: `service_call_id`, `organisation_id`, `checkout_id`, `checkout_reference`, `status`, `created_at`, plus indexes on `service_call_id` and `checkout_reference`.

Scoping reuses the `sumup_webhook_events` pattern (BJ-0044) verbatim, which is:

```sql
GRANT ALL ON public.payment_checkout_attempts TO service_role;
ALTER TABLE public.payment_checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages payment checkout attempts"
ON public.payment_checkout_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
```

One deviation to flag: the scoped `for select using (organisation_id = get_my_org_id())` policy is *not* how `sumup_webhook_events` was scoped — that table has no org-member read policy and no `authenticated` grant at all. The plan follows the "reuse that pattern exactly" instruction, so it ships service-role-only (no client reads). Say the word if you want the org-member read policy added on top instead.

## 2. Reference format — `_shared/sumupCheckout.ts`

- `checkout_reference` becomes `` `${serviceCallId}::${attemptNumber}` ``.
- `attemptNumber` = count of existing `payment_checkout_attempts` rows for that `service_call_id`, + 1. Computed inside `createSumUpDepositCheckout`, immediately before the POST body is built — callers do not compute it.
- Immediately after a successful POST, insert one row: `service_call_id`, `organisation_id`, `checkout_id` (from SumUp), the reference actually used, and `status` from the SumUp response (typically `PENDING`).

`sumupCheckout.ts` today has no database access (deliberately pure, fetch-injected for tests). So it needs two new **optional** args: `supabaseUrl` + service-role `headers` (or an injectable attempt-store for tests) and `organisationId`. Both call sites — `_shared/depositLink.ts` and `send-payment-link/index.ts` — already hold the service-role URL/headers and the org id, so this is a pass-through only; no guard or flow logic in either file changes. When those args are absent (e.g. existing unit tests), attempt number falls back to 1 and no row is written — checkout creation never fails because of tracking.

## 3. Webhook matcher — `_shared/sumupWebhook.ts`

Two places read the reference and both must accept both shapes:

- the discovery branch (`isUuid(reference)` then `loadJobById(reference)`) — split on `::` and use the prefix;
- the verification cross-check (`view.checkoutReference !== job.id`) — compare the prefix.

Both get a shared helper (`jobIdFromCheckoutReference`) plus a comment stating this dual handling is **permanent, not a transitional shim**: old raw-UUID references still exist in SumUp and their webhooks can arrive late, so removing the legacy branch would silently drop real payments.

## 4. Explicitly untouched

- `send-deposit-link`'s PENDING guard (still calls SumUp directly; it will now also produce attempt rows).
- `accept-quote` / `send-payment-link` guard logic.
- `service_calls.sumup_checkout_id` — keeps pointing at the latest checkout id.
- `payment_failed` notifications and `customer_activity` writes.

## 5. Evidence to be produced

- Migration diff.
- Full updated reference-building + insert block from `sumupCheckout.ts`.
- Full updated matcher with both branches and the comment.
- Live: two checkout creations for one test job in K&N sandbox, with both `payment_checkout_attempts` rows pasted showing `jobid::1` and `jobid::2`.
- Live: a webhook replayed against an existing pre-migration raw-UUID reference, showing it still matches and attributes to the right job.
- Existing `sumupCheckout.test.ts` / `sumupWebhook` suites re-run green, plus cases for legacy vs `::` references.
