# BJ-B2b / B2c — K&N positive-path check

The code, data step, and all fail-safe (skip) verification are already done and evidenced. This plan covers only the remaining item: proving K&N still sends correctly, without touching a real customer.

## What's already closed

- All seven functions implemented, deployed, and grep-clean of the three K&N literals.
- Cavan Gas data step applied (blank footer, blank phone), K&N untouched.
- Skip-path evidence pasted for each function, including one log row per org per bulk run.
- Scratch data deleted, post-cleanup counts zero.

## Remaining check

Positive-path send under K&N, using scratch data and a test mobile only.

1. Create a scratch customer under K&N named `ZZ TEST — B2b positive`, with the test mobile you provide.
2. Create a scratch job for that customer, plus a scratch quote (needed for the quote sender).
3. Fire `send-payment-received` (the function that gained new sourcing) and `send-quote-whatsapp` (representing the three REST-based footer functions, which share byte-identical guard code).
4. Confirm each returns a real send — not `skipped` — and that the message body carries K&N's own name, phone, and footer, sourced from their 360messenger config rather than any literal.
5. Paste raw response bodies, the raw `message_log` rows, and the received message text.
6. Delete the scratch customer, job, quote, and their activity/message rows; paste post-cleanup counts.

No K&N config is modified at any point — this is read-only against their branding.

## What I need from you

The test mobile number to use as the recipient. Nothing runs until you give it.

## Notes

- `send-deposit-reminder` stays out of scope for a live fire: it is a cron that scans every org and would message real K&N customers. Its guard is the same shape as `send-payment-received`.
- `trigger-outstanding-reminder` cannot reach its branding guard for K&N-positive purposes without a configured Make webhook; leaving it code-verified.
