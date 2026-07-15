## No further batches needed

Of the 11 files you listed, all already correctly set `organisation_id` on their `message_log` inserts:

- `whatsapp-inbound` — `inboundOrgId`
- `handle-inbound-whatsapp` — `orgId`
- `handle-whatsapp-opt-out` — `customer.organisation_id`
- `send-certificate-whatsapp` — `orgId`
- `send-booking-confirmation` — `orgId`
- `send-upcoming-reminders` — `orgId`
- `send-renewal-reminder` — `orgId`
- `send-cancellation-notice` — `orgId`
- `create-job-invoice` — `job.organisation_id`
- `src/components/whatsapp/SendReminderModal.tsx` — `orgId!`
- `src/components/renewals/SendServiceReminders.tsx` — `orgId!`

The "17 files" figure I quoted earlier was an over-count from grepping every file touching `message_log`. The actual set of broken inserters was 9, all fixed in Batch 1 + Batch 2. No third batch is needed for the `NOT NULL` migration to hold.

### Recommended next step (separate turn, your call)

Move on to one of the previously-scoped follow-ups:

1. `brand_settings.organisation_id_ref` — same collapse pattern as `message_log`
2. Drop hardcoded K&N defaults on `profiles.organisation_id`, `settings.organisation_id`, `whatsapp_messages.organisation_id`
3. Fix Cavan Gas `settings.message_footer` (currently `"K&N Gas Services"`)

No code changes are proposed in this plan — it's a confirmation-only response. Approve to close the loop, or tell me which follow-up to plan next.