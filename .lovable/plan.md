# Fix silent lookup-failure skips in webhook/payment idempotency paths

## What the investigation found

Confirmed NOT defects (no change proposed):

- SumUp webhook idempotency is already DB-enforced: `sumup_webhook_events.checkout_id` is UNIQUE (verified in the live database), and the claim insert happens before any write, treating `23505` as "already processed". There is no SELECT-before-INSERT there.
- The payment ledger is protected by the live partial unique index `idx_job_payments_sumup_checkout_unique` on `job_payments (checkout_id) WHERE source = 'sumup_webhook'`, and the insert path handles `23505` as the correct end state.
- Delivery tracking uniqueness is enforced in the database: `communication_deliveries_related_uniq (organisation_id, comm_type, channel, related_id)` and `communication_delivery_attempts_provider_msg_uniq (provider_message_id)`.
- No refund/chargeback/dispute event handling exists anywhere, and nothing in the SumUp checkout flow consumes such events. Per the constraints, no refund/clawback path will be added.

Confirmed defects — all of the same shape: a failed lookup is silently reported as a legitimate "no match / not applicable" outcome.

1. `_shared/deliveryStatus.ts` — `recordDelivered()` and `recordProviderFailure()` destructure only `data` from `.maybeSingle()`. A genuine query failure (connection error, permission, malformed) yields `data = null`, so both return `{ matched: false }`, the WhatsApp delivery webhook answers `200 ok`, and the provider never retries. A real "delivered" or "failed" receipt is then lost forever and the row is later swept to `delivery_unknown`.
2. `_shared/deliveryStatus.ts` — `findDelivery()` drops its error the same way; on a genuine read failure `beginDelivery` attempts an insert that the unique index rejects, re-reads (fails again), and returns `null`, so the send proceeds with no tracking at all and no error signal.
3. `_shared/messagingConsent.ts` — the customer lookup drops its error, and the surrounding `catch` maps any failure to `reason: "customer_not_found"`. Callers turn that into `200 { success: true, skipped: true }`, so a database failure looks to the office like a legitimate "no such customer" skip.

## The change

`supabase/functions/_shared/deliveryStatus.ts`
- Capture `error` from the three `.maybeSingle()` lookups. On a genuine error, throw a distinct `DeliveryLookupError` from `recordDelivered`/`recordProviderFailure` instead of returning `matched: false`. `findDelivery` propagates its error so `beginDelivery` logs it and returns `null` only for a true "no row" case (current degrade-safe behaviour preserved for absent rows).
- "No row found" (`data === null`, no error) keeps its current meaning exactly: `{ matched: false, changed: false }`.

`supabase/functions/whatsapp-delivery-webhook/index.ts`
- Wrap the two `record*` calls so a `DeliveryLookupError` returns `503 { error: "lookup_failed" }` instead of `200 ok`, letting the provider retry. Secret check, raw-callback logging, classification, and all matched/unmatched behaviour stay as-is.

`supabase/functions/_shared/consentDecision.ts` + `_shared/messagingConsent.ts`
- Add a `"lookup_failed"` reason used only when the customer read genuinely errored (kept separate from `customer_not_found`).
- `consentSkipResponse` returns `503 { success: false, error: "lookup_failed" }` for it, so no send path reports a database failure as a successful skip. `customer_opted_out`, `no_phone_number`, `customer_not_found` and the 403 `customer_wrong_organisation` path are unchanged.

That is 4 files; the fourth (`consentDecision.ts`) exists only because the reason union and its response mapping are split across the pure module and the I/O module.

## Verification

- New unit tests: delivered/failed callbacks with a lookup error surface as errors (webhook 503) while genuine no-match and repeat-callback cases still return `matched: false` / `changed: false`; consent gate returns `lookup_failed` on a throwing/erroring client and unchanged reasons otherwise.
- Concurrency/redelivery evidence: re-assert via SQL that the four unique indexes above exist, and confirm re-delivering the same SumUp checkout id and the same provider message id creates no duplicate rows.
- Run the existing Deno tests for the touched shared modules, the Vitest suite, and typecheck/build.
- No RLS, auth, secret, or tenant-scoping changes; every lookup keeps its existing org/id filters.
