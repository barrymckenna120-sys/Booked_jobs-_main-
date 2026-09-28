# Replace warranty welcome with install-date setting + grace-window reminders

The schedule for the payment queue stays paused throughout. No WhatsApp messages get sent.

## 1. Payment queue function (process-post-payment-messages)
- For `warranty_welcome` rows, stop sending WhatsApp messages. Remove the 360messenger send code and the `buildWarrantyWelcome` import.
- Keep the current eligibility check (`isInstallJob`), organisation-scoped reads and retry-on-database-error behaviour.
- Install date = the job's `completed_at` as a Europe/Dublin date. If that's missing, use `paid_at`.
- Scoped update: `customers.boiler_installation_date = installDate`, filtered by `id = row.customer_id`, `organisation_id = row.organisation_id`, and (`date IS NULL` or `date < installDate`).
- Queue row outcome:
  - `sent` / `install_date_set` if the date was written.
  - `sent` / `install_date_unchanged` if the customer already had the same or a later date.
  - `skipped` / `not_install` for non-install jobs, as now.
- When the date is set, add a customer_activity entry: "Boiler install date set from job <job_reference>".
- Opted-out customers: no message is sent any more, so the opt-out skip isn't needed for this. The install date is still recorded, and warranty-auto-send already excludes opted-out customers.
- Dry run returns `would_set_install_date` with the date, or `would_leave_unchanged`, or `would_skip`.
- Delete `_shared/warrantyWelcome.ts` and its test file. Move `isInstallJob` and its tests into a small shared file, `_shared/installJob.ts` plus its test, keeping the existing tests. Remove any other imports of the deleted file.

## 2. Warranty reminders (warranty-auto-send)
- Use Europe/Dublin "today" instead of UTC.
- Day 14 reminder: install date between today−21 and today−14 inclusive, with no `warranty_day14` entry in the log.
- Day 28 reminder: install date between today−35 and today−28 inclusive, with no `warranty_day28` entry in the log, and renewal_stage not Booked In, Confirmed or Paid.
- Nothing else changes, including the query, the wording and send-warranty-whatsapp.

## 3. Deploy
Deploy both functions with deploy_edge_functions. Record the timestamps.

## 4. Read-only report (raw output)
- a) Commit hash on origin/dev, plus the deploy timestamps.
- b) For K&N and Dublin Gas: how many customers have an install date set, and how many of those are missing boiler_brand or boiler_model.
- c) Mary Black's install date, brand, model and warranty_reminder_log. If she's due a reminder at tomorrow's 9am run, I'll say so and change nothing.
- d) Dry run for DG-1037, expected `would_set_install_date` 2026-09-28. DG-1037 is still unpaid and has no queue row, so this runs the dry-run path using its service_call_id. If the function requires an existing queue row, I'll report that instead of creating one.

## Risk to confirm (live customers)
The wider windows mean any real customer with an install date 14–21 or 28–35 days ago, who hasn't had a reminder, will get one at the next 9am run. Today, K&N and Dublin Gas customers in that range never receive one. Check b) will list how many are affected, grouped by organisation, before tomorrow morning. If the number is unexpected, say so and I'll pause warranty-auto-send.

## Technical notes
- Dublin date helper: `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' })` gives YYYY-MM-DD, and date arithmetic works on that value at T12:00:00.
- The "later date" guard lives in the UPDATE filter, which keeps it idempotent across retries.
- One commit covers the function changes. No database schema changes and no data writes beyond what the function does at runtime.
