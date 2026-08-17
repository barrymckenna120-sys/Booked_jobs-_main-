# Fix the three broken pg_cron jobs (proposal only)

Align `warranty-auto-send`, `quote-followup-day3`, and `quote-followup-day6` to the cron pattern already working for `job-reminder-2day-0900-dublin` and `send-deposit-reminder-daily`. SQL-only; no Edge Function code changes.

## Current commands, side by side

Working — `send-deposit-reminder-daily` (jobid 2, `0 9 * * *`):

```sql
select net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/send-deposit-reminder',
  headers := '{"Authorization": "Bearer <anon key literal>", "Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
);
```

Working — `job-reminder-2day-0900-dublin` (jobid 9, `0 9 * * *`):

```sql
select net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/job-reminder-2day',
  headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon key literal>"}'::jsonb,
  body := '{"scheduled":true,"source":"pg_cron"}'::jsonb
);
```

Broken — `quote-followup-day3` (jobid 6) and `quote-followup-day6` (jobid 7), identical shape:

```sql
select net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/quote-followup-day3',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer '
             || current_setting('app.service_role_key') || '"}'::jsonb,
  body := '{}'::jsonb
);
```

Broken — `warranty-auto-send` (jobid 3):

```sql
SELECT net.http_post(
  url := current_setting('app.supabase_url') || '/functions/v1/warranty-auto-send',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.service_role_key')
  ),
  body := '{}'::jsonb
);
```

The only difference is the credential source. The working jobs inline the URL and key as literals; the broken three read `app.supabase_url` / `app.service_role_key`, which are not set on this database. Day3/day6 fail with `invalid input syntax for type json` (NULL collapses the JSON string); warranty fails with `unrecognized configuration parameter "app.supabase_url"`.

## Proposed change

Three `cron.alter_job` calls (keeping jobid, name, and `0 9 * * *` schedule untouched), each replacing the command with the inlined-literal form:

```sql
select cron.alter_job(
  job_id := 6,
  command := $$
  select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/quote-followup-day3',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon key literal>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

The same for jobid 7 (`quote-followup-day6`) and jobid 3 (`warranty-auto-send`, with the URL also inlined instead of `current_setting`).

All three functions are `verify_jwt = false`, so the anon key in the header is sufficient — exactly as the two working jobs do it. No service-role key is placed in the cron command.

Because these literals are project-specific values, this goes through the insert/SQL tool rather than a tracked migration, matching how the working cron jobs were created.

## Confirmations

- This is purely a `cron.alter_job` (SQL-level) change. No edits to `quote-followup-day3/index.ts`, `quote-followup-day6/index.ts`, `warranty-auto-send/index.ts`, or `send-warranty-whatsapp/index.ts`.
- `send-warranty-whatsapp`'s hardcoded Tally fallback is explicitly out of scope here.

## Backlog risk on first successful run

Checked against live data — none of the three can flood a backlog, because all three filter on a narrow rolling window rather than "everything not yet sent":

- `quote-followup-day3` requires `sent_at` between 4 and 3 days ago. Quotes older than that are permanently skipped. Currently eligible: **0**. (37 quotes have `follow_up_day3_sent = false` across all history, but only ones inside the 24-hour window can ever be picked up.)
- `quote-followup-day6` requires `sent_at` between 7 and 6 days ago **and** `follow_up_day3_sent = true`. Since day3 has never run, that flag is set on exactly one row (this session's manual test), so day6 has nothing to chase. Currently eligible: **0**.
- `warranty-auto-send` matches `boiler_installation_date` to exactly `today - 14` and `today - 28`, plus a `warranty_reminder_log` dedup check. Currently eligible: **0** on both dates.

So the first successful run is expected to be a no-op, and thereafter only genuinely fresh quotes/installs get messaged. The trade-off to note: the same narrow windows mean a day skipped by an outage is lost permanently rather than caught up — that is the existing 24-hour-window gap already documented as its own task, not something this fix changes.

Secondary risk once the jobs actually run: `send-warranty-whatsapp` starts reaching real K&N customers again for the first time since April. K&N is the only tenant with warranty-ready customers (15), and its Tally URL is correctly configured, so the K&N path is safe — but the Tally fallback leak stays live for any other tenant, which is why that fix should land before another tenant gets warranty data.

## Verification after applying (when approved)

- Re-read `cron.job` for jobids 3, 6, 7 and confirm the commands contain no `current_setting`.
- Run each command body once manually (or `SELECT cron.schedule`-free direct `net.http_post`) and confirm `cron.job_run_details` shows `succeeded`, plus a fresh `edge_function_logs` row per function.
- Confirm the functions return `sent: 0, skipped: 0` style no-op payloads, i.e. no live customer message was triggered.
