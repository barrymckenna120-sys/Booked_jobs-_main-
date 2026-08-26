# Warranty send: confirm the no-fallback guard, then prove it live

## What I found before planning

The code change you asked for is **already in place**. `send-warranty-whatsapp` has no hardcoded Tally URL:

- The only occurrence of `RGJDy4` anywhere in the repo is in a unit test fixture (`_shared/rebookLink.test.ts`) — not in any send path.
- The function resolves the form URL per organisation from `tenant_integrations` (`integration_type = 'tally'`), with a comment stating "No cross-tenant fallback".
- When the URL is missing it calls `logSkip(...)`, which writes an `edge_function_logs` row (`SKIPPED: missing_renewal_form_url — ...` with `organisation_id` in the payload) plus a `message_log` row, and returns `{ success: true, skipped: true, reason: "missing_renewal_form_url", organisation_id }` at HTTP 200. No message is sent.

So there is nothing to remove. What is genuinely outstanding is your deploy + live proof, and there are two blockers.

## Blocker 1 — Cavan Gas has no customers

`send-warranty-whatsapp` looks the organisation up **from the customer**, not from a request field. Cavan Gas (`62d6c1c3-…`) currently has **0 customer rows**, so a test call against it would fail earlier with `400 Customer missing organisation_id` and never reach the skip branch. That would prove nothing.

To get a real response from the skip path, the test needs one `ZZ SCRATCH` customer in Cavan Gas with a scratch phone number. That is a database write, so it is its own review-gated step below.

## Blocker 2 — the guard reads `new_booking_url`, not `renewal_form_url`

Your prompt names `renewal_form_url`. The guard actually keys on `config.new_booking_url`. For Cavan Gas both are empty strings, so the skip fires either way and the live test will pass — but the field the warranty template should use needs confirming before I call this done. K&N has both set to different URLs (`book.` vs `rebook.`), so the choice is not cosmetic. I will not change the field in this step; I will report which one the message body actually needs and let you decide.

## Steps

1. **DB write (isolated, review-gated):** insert a single `ZZ SCRATCH` customer into Cavan Gas with a reserved scratch phone number, boiler brand/model set, `opted_out = false`. No other rows touched.
2. **Deploy** `send-warranty-whatsapp` unchanged, to confirm the deployed version matches the repo (the guard may predate the last deploy).
3. **Live HTTP test:** POST to the deployed function with the scratch customer's id and `message_type: "warranty_day14"`. Show the actual JSON response verbatim.
4. **Show the log row:** query `edge_function_logs` for the row that call created and paste it.
5. **Report** the `new_booking_url` vs `renewal_form_url` question with a recommendation.

## Not touched

`warranty-auto-send`, any pg_cron schedule, message content, phone normalisation, `warranty_reminder_log` writes, and `message_type` handling all stay exactly as they are.

## Risk

Low. The scratch customer has no real phone number and the expected outcome is a skip, so no outbound WhatsApp is possible on this path. If the response comes back as a send rather than a skip, I stop and report instead of continuing.
