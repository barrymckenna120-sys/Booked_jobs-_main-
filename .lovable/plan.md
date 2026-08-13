# Wire the two Step 4 WhatsApp toggles in the New Job wizard

The audit confirmed the deposit toggle is dead UI state — nothing creates a SumUp checkout, nothing writes `service_calls.payment_link`, no WhatsApp goes out, and the deposit reminder never picks the job up because it requires a `payment_link`.

## 1. Shared deposit-link module

New `supabase/functions/_shared/depositLink.ts`, extracted from `accept-quote`'s private `sendDepositPaymentWhatsApp`. It accepts `{ service_call_id, deposit_amount, customer_id, organisation_id }` — the organisation is always passed in by the caller and never resolved inside the module, so it cannot be steered across tenants.

Behaviour preserved exactly: per-organisation SumUp credentials with no global fallback, per-checkout webhook return URL, `payment_link` + `sumup_checkout_id` written back to the job, tenant 360Messenger key resolved through `_shared/whatsappCredentials.ts`, message log row moving pending → sent/failed, customer activity entry only on a successful send. Same skips as today: no deposit, no job, no organisation, customer opted out, no phone, no SumUp credentials.

## 2. accept-quote delegates to it

`accept-quote` calls the shared module instead of its private copy — a pure extraction, no behaviour change, same background-task handling.

## 3. New `send-deposit-link` function

`verify_jwt = true`. Order of operations:

1. Resolve the caller's organisation via `get_my_org_id()`.
2. Load the job and confirm its organisation matches the caller's **before** reading or writing anything else. A mismatch or missing row returns the same not-found response, so it never reveals that a job exists under another tenant.
3. Read the deposit amount and customer from that job row — never from the request body.
4. If the job already has a SumUp checkout that is still pending, stop and report it instead of creating a second one. This is what protects against a double-click or duplicate submit.
5. Run the shared module with the verified data.

## 4. Wizard wiring

After the job insert succeeds, the wizard calls `send-deposit-link` only when the deposit toggle is on **and** a deposit amount greater than zero exists. Payment status "Invoice After" or "Paid in Full" never sends, regardless of toggle state. Failures surface as a non-blocking warning — job creation itself never fails because a message failed.

## Out of scope

No change to the job insert, to organisation resolution in the wizard, or to any report query or filter.

## Verification (evidence, not self-report)

- New K&N test job, Deposit Taken + toggle on: WhatsApp received, the actual job row shown with `payment_link` populated, message log row shown with the correct organisation.
- Toggle off: message log query proves no send was attempted.
- Rapid resubmit: query proves only one SumUp checkout exists for that job.
- Direct call to `send-deposit-link` with a Dublin Gas job as a K&N caller: rejected, actual response shown.
- Accept a quote with a deposit: unchanged end to end, proving the extraction was behaviour-neutral.
- Invoice After with the toggle on: no checkout created.
- All test jobs, checkouts, and message rows removed afterwards.

## Technical notes

- New: `_shared/depositLink.ts`, `supabase/functions/send-deposit-link/index.ts` (plus its `verify_jwt = true` block in `supabase/config.toml`).
- Edited: `supabase/functions/accept-quote/index.ts`, `src/components/jobs/NewJobPanel.tsx`.
- No database migration and no schema change.
