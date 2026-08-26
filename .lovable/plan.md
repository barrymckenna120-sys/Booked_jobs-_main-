# Plan: Quote approval retry + missing deposit link fix

## What this should do
- A fresh quote approval should create/confirm the job and send the deposit payment WhatsApp.
- If a quote link is tapped again after it was already used, the public page should not silently pretend a new payment link was sent.

## Happy path
- Customer opens a valid quote link, approves, and receives the deposit WhatsApp for the correct amount.
- Office sees the quote/job as accepted with the payment link recorded.

## Obvious breaks to cover
- Already-used quote token: show a clear error unless the backend can safely recover a missing deposit link.
- Existing converted job still needs a deposit: backend may resend/create the deposit link without re-creating the job.
- Existing converted job already has deposit paid: do not send another payment link.
- Missing checkout/message send failures must be surfaced instead of hidden.

## Scope
- Update `accept-quote` only for safe idempotent recovery of missing deposit links.
- Update the public quote approval page to stop treating `already_actioned` as success.
- Add regression coverage for the new decision logic.
- After code verification, perform any scratch-data reset as a separate database review step only if still needed.

## Technical details
- Add a small pure helper around quote approval response handling so it can be unit tested.
- In `accept-quote`, when `respond_to_quote` returns `already_actioned`, fetch the converted job and only call the shared deposit-link sender if:
  - the quote has a converted job,
  - the deposit amount is greater than zero,
  - the job is not marked deposit-paid / paid,
  - and there is no current usable payment link state that should block a resend.
- Return explicit status values such as `deposit_link_sent`, `already_paid`, or `already_actioned` for the frontend.
