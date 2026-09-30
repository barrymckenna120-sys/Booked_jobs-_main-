# WhatsApp test mode (per tenant)

## Goal
Each tenant has a WhatsApp test mode. In test mode, messages go only to numbers on that tenant's allowed list. All other messages are blocked and logged, and automations still get a success response. Only the superadmin can change these settings. No screens are added in this work.

## Decisions (from your answers)
- New tenants start in test mode. K&N and Dublin Gas stay LIVE. Cavan Gas is switched to test mode.
- Changes are rolled out in stages and reviewed one step at a time. Each step is tested on Cavan Gas before the next starts.

## Corrections to the brief
- The brief refers to "accounts", but the tenant table is `organisations`. The new settings go on that table.
- Keys are stored per tenant, not as one shared `THREESIXTY_API_KEY`. The check reuses the existing per-tenant key lookup and does not change it.
- The 360 Messenger API needs numbers as digits with no `+` (for example `353...`). Allowed numbers are stored in that form and compared after the same number clean-up used today. Otherwise a number stored as `+353...` would never match.

## Stages (each one is a separate, reviewed step)
1. **Schema change**: add `whatsapp_test_mode` and `whatsapp_allowed_numbers` to `organisations`. The column is added with a default of false, so existing tenants stay LIVE. The default is then changed to true, so new tenants start in test mode. A protection trigger lets only the superadmin (checked with `is_superadmin`) change either column. Tenant users can read the test-mode flag. The allowed-numbers column is not exposed to them.
2. **Data change**: set Cavan Gas to test mode and add your approved test number. Then read the rows back to confirm all three tenants.
3. **Shared check** (`_shared/whatsappGuard.ts`): a single check that decides whether to send or block, with unit tests. When it blocks, it writes a `message_log` row with status `suppressed_test_mode` and the tenant, recipient, message type and time.
4. **Make.com endpoint** `send-whatsapp-guarded`: it requires a matching `MAKE_WEBHOOK_SECRET` header, validates the tenant, recipient, template and variables, and checks `opted_out`. It then runs the shared check and sends only if allowed. The secret is created and shown to you only once this endpoint is live.
5. **Move the sending functions** onto the check in small batches of about 5. Each batch is deployed and then tested on Cavan Gas:
   - Batch A: `send-whatsapp-receipt`, `send-booking-confirmation`, `send-payment-link`, `_shared/depositLink.ts`, `send-renewal-reminder`
   - Batches B to F: the remaining functions that call 360 Messenger. There are 33 in total, including `_shared/notifyAdmin.ts`, the reminders, quotes, invoices, hazard, certificates, bulk area, inbound replies and the SumUp webhook.
   - Wording, logging and existing behaviour are kept exactly as they are.
6. **Final audit**: list every place that calls 360 Messenger and mark each one as checked, or flagged with a reason. Report every file and migration changed, and confirm the backend functions were deployed.

## Flags to settle during the audit (not changed without asking)
- `get-template-status` and `provision-whatsapp-templates` only manage templates and never message customers, so they are expected to be excluded.
- Messages to the office or admin (`notifyAdmin`, `quote-accepted-alert`) go to staff numbers. In test mode they would be blocked unless those numbers are on the allowed list.
- Make.com scenarios that call 360 Messenger directly are outside this code, so they stay unchecked until they switch to the new endpoint.

## Verification
- Stage 1: read the rows back to confirm the columns and defaults. A tenant user trying to change either column is rejected, and a superadmin change succeeds.
- For each batch, on Cavan Gas only:
  - Sending to an allowed number reaches the number, and the `message_log` row shows it was sent.
  - Sending to a number not on the list is not sent to 360 Messenger. A `suppressed_test_mode` row is written and the function returns success.
- K&N and Dublin Gas: logs are checked to confirm messages still send normally. No test messages go to real customers.
