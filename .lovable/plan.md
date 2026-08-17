# Re-run live verification of send-invoice-whatsapp

The function code is already updated (tenant payment link from integrations, tenant business name/phone, skip-and-log on missing config, `x-make-secret` on the `log-message` call). No code changes are needed. This plan is only to re-run the three live verification calls and paste raw evidence.

## What will happen

1. **K&N real send** — call the function for one existing K&N invoice job. This sends a real WhatsApp message to that customer. Paste the raw JSON response body, then the raw `message_log` row(s) inserted for it.
2. **Cavan Gas skip case** — create a scratch Cavan Gas job/invoice, call the function, expect `{"success":true,"skipped":true,"reason":"payment_link_not_configured"}`. Paste the raw JSON response and the raw `edge_function_logs` row.
3. **Cleanup + proof** — delete the scratch Cavan Gas records, then paste the raw count query showing zero `message_log` rows for that job.

Output will be raw JSON bodies and raw database rows only, no written summary.

## Notes

- Step 1 is an outbound message to a live customer. If you would rather it target a specific job reference, say which one; otherwise the most recent K&N invoice job with a valid mobile is used.
- No schema changes, no function redeploys unless a call fails and the failure is in the new code path.
