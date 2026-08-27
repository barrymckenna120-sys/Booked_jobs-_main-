# send-warranty-whatsapp: read `renewal_form_url` instead of `new_booking_url`

## The change (single concern)

In `supabase/functions/send-warranty-whatsapp/index.ts`, the Tally lookup currently does:

```ts
if (cfg?.new_booking_url) { tallyFormBase = cfg.new_booking_url; }
```

It becomes `cfg?.renewal_form_url` — no fallback to `new_booking_url` or anything else. The `logSkip("missing_renewal_form_url", ...)` branch and its 200 `{ success: true, skipped: true, reason: "missing_renewal_form_url", organisation_id }` response stay byte-identical apart from the detail string naming the correct field.

Nothing else in the function changes: no message-body edits, no phone normalisation, no `warranty_reminder_log` changes, no `message_type` handling.

Not touched: `create-booking-link`, `renewal-reminder-30`, `renewal-reminder-14`, `send-renewal-reminder`, `missed-call-lookup`, `warranty-auto-send`, pg_cron.

## Verified config before planning

`tenant_integrations` (integration_type = tally):

- K&N (`8c37827f-…`): `new_booking_url = https://book.kngasservices.ie/`, `renewal_form_url = https://rebook.kngasservices.ie/` — so this change genuinely swaps the link the warranty message carries.
- Cavan Gas (`62d6c1c3-…`): both fields empty strings — skip path unchanged there.

## Steps

1. Apply the one-line field change (plus the skip detail string).
2. Deploy `send-warranty-whatsapp`.
3. Live test A — Cavan Gas scratch customer `e43c42f0-0b0e-43d0-8e5b-b4c427f4fb42`, `message_type: "warranty_day14"`. Expect the same skip JSON at 200; paste the verbatim response plus the `edge_function_logs` row.
4. Live test B — real outbound send for K&N scratch customer `ZZ Scratch CancelConfirm Test` (`7380540d-…`, `+212656802656`), `message_type: "warranty_day14"`. Approved as a controlled scratch handset.
5. Report, verbatim: response A, response B, the exact outbound message body and link, and the `edge_function_logs` + `message_log` rows both tests created — explicitly confirming the link is `rebook.kngasservices.ie` and not `book.kngasservices.ie`.


## Risk

Low. One field read changes; the failure mode is "skips instead of sending", never "sends the wrong link". If the K&N test returns a send with a `book.` URL rather than `rebook.`, I stop and report.
