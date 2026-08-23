# BJ-0081 — Receipt on webhook-confirmed full payment

Single concern: when a SumUp webhook confirms a payment that brings a job to fully paid, send the customer the same receipt the completion flow sends. Nothing else in the webhook changes.

## What changes

1. `supabase/functions/_shared/sumupWebhook.ts`
   - Add one new optional dependency, `sendReceipt`, to `SumUpWebhookDeps`.
   - Call it only on the `fullyPaid === true` path, after `updateJob` / `logActivity` / `logMessage` / `notifyOffice` have all run, wrapped in try/catch so a send failure never changes the outcome and never makes SumUp retry a payment we already recorded.
   - Deposit-only / partial payments do not send anything.
   - `updateJob`, `logActivity`, `logMessage`, `recordAttemptStatus`, office notifications and every existing outcome stay byte-identical.

2. `supabase/functions/sumup-payment-webhook/index.ts`
   - Implement `sendReceipt` with a duplicate guard, in this order:
     - Re-read `service_calls.receipt_sent` for the job. If true, log `receipt skipped (already sent)` and return.
     - Look for an existing `message_log` row for the job with `message_type` in (`receipt`, `payment_received`). If one exists, log `receipt skipped (duplicate)` and return.
     - Otherwise invoke `send-whatsapp-receipt` with `{ job_id }` using the service-role key (same function the engineer completion flow uses; it stamps `receipt_sent = true` on success, so any later completion flow will not re-send).

3. No changes to `TakePaymentModal.tsx`, `useEngineerJobs.ts`, `send-whatsapp-receipt`, `send-payment-received`, the database schema, or any other function.

## Notes on the idempotency requirement

Per-checkout dedup already exists and is stronger than a message lookup: `sumup_webhook_events.checkout_id` is UNIQUE and is claimed before any write, so a given checkout id can only reach the send path once. `message_log` has no `checkout_id` column, so the second layer is necessarily per-job (`receipt_sent` plus a receipt/payment message row) — which is exactly what protects against the completion flow having already sent one. Both layers are logged when they skip.

`send-whatsapp-receipt` is chosen over `send-payment-received` because it is the function that sets `receipt_sent` / `receipt_sent_at`, generates the receipt PDF, and tolerates a job with no `receipt_number` or `completed_at` — the state KN-513 is in.

## Verification

- Unit tests on the shared module: fully-paid → `sendReceipt` called once; deposit/partial → not called; duplicate delivery (claim rejected) → not called; `sendReceipt` throwing → outcome still `paid`.
- Live path: a fresh scratch job with a reserved test phone number, driven to PAID via a real checkout, then a second delivery of the same checkout to prove no second send. Then a scratch job that already has a completion-flow receipt, to prove the guard skips.
- Queries reported afterwards: `service_calls.receipt_sent/receipt_sent_at`, `message_log` rows for the scratch job, and the webhook log lines showing send vs skip.
- KN-513 belongs to a real customer, so no message is sent to it during verification. Whether to send its missing receipt now is a separate call for Barry once this is live.

## Sequence

1. Apply both file edits, show the diff, hold for approval before deploy.
2. Run typecheck/build and the unit tests.
3. Deploy, run the scratch-job verification, report the queries and logs.
