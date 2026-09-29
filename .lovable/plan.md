# KN-001 duplicate WhatsApp receipt (engineer app)

## What the records show so far (test company, 29/09/26)
- 10:16 SumUp €50 deposit → one part-payment WhatsApp (correct).
- 10:21 €50 card payment in the engineer app → job marked Paid/Completed.
- BookedJobs recorded only **one** receipt send (one message log row, one delivery row, one call to the receipt sender). You saw **two** on the phone.
- The warranty queue row for this job is still pending and did not send anything.

So the second receipt is either not being logged, or comes from a second send path. Cause is **not yet confirmed**.

## Leading suspect (to confirm first)
Two receipt senders fire for the same payment in the engineer app:
1. The payment/complete code sends the receipt itself (on standalone Take Payment this is fire-and-forget, not awaited).
2. It then opens the receipt screen, which **auto-sends** the receipt on load if the job isn't yet marked `receipt_sent`.

If (1) hasn't finished when (2) loads, both send. Independent of amount; €50 may just be when you hit it.

## Steps
1. **Reproduce** on the test company only, scratch job + scratch phone number, via the engineer app at phone size: €50 part-paid job, take the €50 balance. Record every call to the receipt sender and every WhatsApp log row. Repeat with a different balance (e.g. €30) and with Complete Job.
2. If two calls appear → confirmed. If only one call but two messages arrive → cause is outside the app (e.g. Make scenario or provider retry); stop and report before changing code.
3. **Fix (if confirmed), 1 file:** make the receipt screen not auto-send when the previous step already sent (or is sending) the receipt — pass a "receipt already sent" flag on navigation, so there is exactly one sender per payment. Manual "Send via WhatsApp" button stays as-is so legitimate resends still work.
4. Regression test for the auto-send decision (sent by previous step → no auto-send; direct open of unsent receipt → still auto-sends).

## Verification
- Test-company repro sends exactly one receipt for €50 and for another amount, for both Take Payment and Complete Job.
- Manual resend button still sends once per tap.
- Full test suite, typecheck, build.

## Technical details
- Files likely touched: `src/pages/ServiceReceipt.tsx` (auto-send effect), `src/hooks/useEngineerJobs.ts` (navigation state), one test file.
- No server, database or wording changes. No real customer messages.
