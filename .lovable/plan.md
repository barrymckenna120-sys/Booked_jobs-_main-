# Wire the two Step 4 WhatsApp toggles in the New Job wizard

Two separate defects, confirmed by the audit.

## Problem 1 — "Send deposit payment link" does nothing

The toggle's value reaches `handleSubmit` as `payment.sendDepositLink` and is then never read. Nothing creates a SumUp checkout, nothing writes `service_calls.payment_link`, no WhatsApp goes out, and — because the deposit reminder job requires a `payment_link` — the customer is never chased either. The job is saved with `deposit_amount` and `balance_due` set and `payment_link` empty.

**Fix:** move the deposit-link logic that already works on quote acceptance into a shared module and call it from job creation.

- Extract the body of `sendDepositPaymentWhatsApp` (currently private to `accept-quote`) into `supabase/functions/_shared/depositLink.ts`, taking `{ service_call_id, deposit_amount, customer_id }` instead of a quote row. Behaviour stays identical: per-org SumUp credentials (no global fallback), per-checkout webhook return URL, write `payment_link` + `sumup_checkout_id` back to the job, tenant 360Messenger key, pending → sent/failed row in the message log, customer activity entry on success.
- `accept-quote` keeps working exactly as today, now calling the shared module — same skip conditions (no deposit, no converted job, opted out, no phone, no org, no SumUp creds).
- New function `send-deposit-link` that takes `service_call_id`, requires a signed-in caller, derives the organisation server-side, reads the deposit amount off the job, and runs the shared module. It does not trust an amount or organisation from the request body.
- The wizard invokes it after the job insert when the deposit toggle is on and a deposit amount exists.

## Problem 2 — booking confirmation reports success even when it fails

The booking-confirmation call is wired, but its error is only written to the console, and the success screen prints "Booking confirmation sent via WhatsApp ✔" regardless. Silent skips are easy to hit: the customer has no phone, the tenant has no messaging integration row, or the send is rejected upstream.

**Fix:** read the result of both sends and tell the truth.

- Capture the outcome of the booking-confirmation call and of the new deposit-link call.
- The success screen shows a tick only for sends that actually succeeded; anything that failed or was skipped shows a muted warning line with the reason instead.
- Add a non-blocking warning toast when either send fails. Job creation itself never fails because of a message failure.
- One gap worth closing while we're here: the booking confirmation does not check the customer's opt-out flag, unlike every other customer-facing send. Skip and report when the customer has opted out.

## Out of scope

No change to the job insert itself, to organisation resolution, or to any report query or filter.

## Verification

- Create a job with a deposit and both toggles on: deposit WhatsApp arrives, `payment_link` populated on the job, two sent rows in the message log, success screen shows two ticks.
- Create a job for a customer with no phone: job saves, success screen shows the skip reason, no message rows marked sent.
- Create a job with deposit toggle off: no SumUp checkout created at all.
- Accept a quote with a deposit: unchanged end-to-end, proving the extraction was behaviour-neutral.
- Clean up all test jobs, checkouts, and message rows afterwards.

## Technical notes

- New: `supabase/functions/_shared/depositLink.ts`, `supabase/functions/send-deposit-link/index.ts` (`verify_jwt = true`, org via `get_my_org_id()`).
- Edited: `supabase/functions/accept-quote/index.ts` (delegates to the shared module), `supabase/functions/send-booking-confirmation/index.ts` (opt-out check, clearer skip reasons in the response), `src/components/jobs/NewJobPanel.tsx` (invoke the deposit send, track both outcomes, honest success screen).
- Credential resolution stays on the existing tenant-scoped path used by the quote flow; no change to secret names.
- No database migration and no schema change.
