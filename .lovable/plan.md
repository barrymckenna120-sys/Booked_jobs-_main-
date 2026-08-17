# BJ-0050b: Shared reuse guard across all 3 checkout callers

Single concern: before creating a SumUp checkout, reuse an existing still-valid PENDING checkout for the same job and amount. One shared implementation, used by all three creation paths.

## What changes

### 1. `_shared/sumupCheckout.ts` — new `findReusableCheckout`

- Extend `CheckoutAttemptStore` with `latest(serviceCallId, organisationId)` returning the newest row (`checkout_id`, `checkout_reference`) or `null`. The REST store filters on both `service_call_id` and `organisation_id` (org filter is defense-in-depth), `order=created_at.desc&limit=1`.
- `findReusableCheckout({ store, serviceCallId, organisationId, requestedAmount, apiKey, doFetch })`:
  - no store, no org id, or no row → `null`
  - live `GET https://api.sumup.com/v0.1/checkouts/{checkout_id}` with the org's SumUp key
  - reuse only when `status === "PENDING"` **and** the returned amount equals `requestedAmount` rounded to 2dp
  - on reuse, return `{ checkoutId, checkoutReference, url }` taking the hosted URL straight from the GET response (`hosted_checkout_url` or nested `hosted_checkout.url`); if the GET has no usable URL → `null`
  - **fail-closed correction:** any non-2xx, network error, or parse failure returns `null` (create a fresh attempt) — the opposite of the old `isCheckoutPending` behaviour, which returned "pending" on error

### 2. Integration point

At the very top of `createSumUpDepositCheckout`, after the existing amount/reference/credential guards and after the store is resolved, call `findReusableCheckout`. Non-null → return `{ ok: true, url, checkoutId, checkoutReference, reused: true }` with no SumUp POST and no new attempt row. Null → fall through to the untouched 0050a attempt-numbering + POST + insert path, returning `reused: false`.

`SumUpDepositResult` gains `reused?: boolean` and `checkoutReference?: string`.

### 3. Callers — response contracts preserved

- **`send-deposit-link`**: delete the local `isCheckoutPending` helper and its pre-check block; instead call `sendDepositLink` as normal and, when the shared guard reports `reused: true`, keep returning `{ success: true, skipped: "checkout_already_pending", payment_link }`. `depositLink.ts` surfaces `reused` in its result so the function can branch (and skips re-sending WhatsApp for a reused checkout, matching today's skip behaviour).
- **`accept-quote`** (via `depositLink.ts`): no code change beyond the `reused` pass-through — it now inherits the guard.
- **`send-payment-link`**: no code change — inherits the guard; existing response shape unchanged.

### 4. Not touched

Attempt-numbering/insert logic, `service_calls.sumup_checkout_id` pointer behaviour, webhook matcher, `payment_failed` notifications, `customer_activity` writes.

## Tests

New Deno cases in `sumupCheckout.test.ts` with an injected `attemptStore` + fake fetch:
- PENDING + matching amount → reuse, zero POSTs, no new attempt row, `reused: true`
- PENDING + mismatched amount → new checkout created
- terminal status (FAILED/EXPIRED/PAID) → new checkout created
- GET non-2xx / network throw / unparseable body → new checkout created (fail-closed)
- no prior row → unchanged 0050a path, `reused: false`
- reuse returns the URL from the GET, no second HTTP call

Re-run `sumupCheckout.test.ts`, `sumupWebhook.test.ts`, `paymentLink.test.ts` green.

## Live verification (K&N sandbox test job)

1. Call `send-payment-link` twice → second call returns the same checkout id, `payment_checkout_attempts` still has exactly one new row for that amount.
2. Same job, deliberately different requested amount → new checkout created, second attempt row appears.
3. Fresh job: `send-deposit-link` twice → first `reused: false`, second returns `skipped: "checkout_already_pending"` with the same payment link.
4. Fresh job via `accept-quote` deposit path twice → first-attempt behaviour unchanged, second reuses.

Evidence pasted: the full `findReusableCheckout` + integration block, the queried attempt rows, and the test run output.
