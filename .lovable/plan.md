# WhatsApp test mode: Stage 2, wire the guard into every send

## Goal
Every WhatsApp message to a customer goes through one shared send step. That step checks the company's test mode before contacting 360 Messenger. Message wording, templates and every company's setting stay exactly as they are. No messages are sent during this work.

## Where the guard lives
The two shared routines that send today each do one narrow job. One sends deposit links, the other sends platform admin alerts. Neither is a general sender. The guard therefore goes into the existing shared WhatsApp helper that every feature already uses for settings and phone formatting. No new shared file is created. The deposit-link routine is switched to call it.

## What the shared send step does
1. It formats the recipient number with the existing phone helper, which handles 08x, 8x, +353 and 00353 numbers. It compares that number against the approved list, formatted the same way. The number sent to 360 Messenger keeps today's format: digits only, with no "+".
2. It reads the company's test-mode setting. If the company can't be found or the setting can't be read, nothing is sent and the send is recorded as an error.
3. If test mode is ON and the number is not on that company's approved list:
   - nothing is sent
   - a message log row is saved with status `suppressed_test_mode`
   - the feature receives a "success, suppressed" result
4. Otherwise it sends exactly as today.
5. A badly formatted number, a missing key or a provider error is still reported as an error, never as "suppressed".
6. The opt-out checks stay in place. Test mode is an extra check on top of them.

## Batches (one feature at a time, message wording unchanged)
1. Bookings and reminders: booking confirmation, schedule confirmation, reschedule, cancellation notice, cancel-job notify, 2-day reminder, upcoming reminders, renewal reminder, part arrived
2. Quotes, invoices and payments: quote WhatsApp, quote follow-up day 3 and day 6, quote accepted alert, accept quote, create job invoice, invoice WhatsApp, outstanding invoice reminders, payment link, extra-work payment link, payment received, WhatsApp receipt, SumUp payment webhook, deposit-link routine
3. Certificates, warranty, bulk and alerts: certificate, hazard, warranty, bulk area send

## Not changed
- The template-check routine
- The incoming-reply routine
- Test-mode settings and approved numbers for every company
- Company names

## Approved conditions
1. **Sent markers.** Before changing each feature, check whether it records a send after sending, such as reminder-sent flags, last-sent dates, follow-up day flags or status changes. The shared step returns `sent` or `suppressed`. Features only record a send, or move the job to its next step, when the result is `sent`. A suppressed message leaves the customer unchanged, so it goes out normally once the company is LIVE. The report lists every feature where this applied.
2. **Platform alerts.** Only the platform admin alert routine may use "platform". Any customer-facing feature that calls the shared step without a real company ID gets an error.
3. **Payment features.** Approved. In those files only the send line and the sent-status check change, and each file gets a unit test.
4. **Extra test.** A suppressed renewal reminder must not update any sent marker.
5. Stop before deploying.

## Checks (no real sends)
- Unit tests for the shared step, with 360 Messenger faked:
  - test mode ON with an unapproved number: suppressed and logged
  - test mode ON with an approved number, in each of the four number formats: sent
  - test mode OFF: sent exactly as today
  - unknown company: error
  - badly formatted number: error
  - approved number from another company: suppressed
- The existing message-wording tests still pass.
- A final code search lists every remaining direct call to 360 Messenger. Only the template check and incoming replies should be left.
- Report: the files changed and the search result. Then stop. Functions are not deployed until you approve.

## Technical details
- `_shared/whatsapp.ts` gains `sendWhatsApp({ supabase, organisationId | "platform", to, text, messageType, customerId?, related… })`. It uses `phoneMatchKey`/`toE164Digits` from `_shared/phone.ts` and posts with `buildSendMessageForm` and `WHATSAPP_SEND_URL`.
- Each feature keeps its own API-key lookup and message text as they are today, and only its direct `fetch(...360messenger...)` call is replaced.
- The `message_log` columns used by the suppressed row are checked before any code is written.
