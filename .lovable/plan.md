# BJ-0053b: Notification retention

## Answer to your question first
`notifications` has **no `read_at` column**. The columns are: `id`, `recipient_user_id`, `notification_type`, `title`, `body`, `metadata`, `is_read` (boolean), `created_at`, `job_id`, `role`, `organisation_id`.

So today the only age reference available is `created_at` — meaning a 6-month-old notification read this morning would be purged immediately, not 30 days after it was read.

Recommended fix (no frontend changes): add a nullable `read_at` column plus a database trigger that stamps `read_at = now()` whenever `is_read` flips from false to true. That makes retention accurate for everything read from now on, and `useNotifications.ts` / `NotificationBell.tsx` stay untouched. For rows already marked read before the column exists, the cleanup falls back to `created_at` via `coalesce(read_at, created_at)`.

## Scheduling mechanism
pg_cron is already the pattern here — five existing daily jobs (`send-deposit-reminder-daily`, `warranty-auto-send`, `quote-followup-day3`, `quote-followup-day6`, `job-reminder-2day-0900-dublin`), all `0 9 * * *` calling edge functions via `net.http_post`. Make.com is not used for scheduled DB maintenance.

Since this cleanup is pure SQL with no messaging, it does not need an edge function — a cron job running the DELETE directly is simpler and has no auth surface.

## Current data (all orgs, for reference)
| Org | Total | Read | Read + older than 30 days | Unread |
| --- | --- | --- | --- | --- |
| K&N Gas Services | 662 | 20 | 10 | 642 |
| Dublin Gas | 166 | 2 | 2 | 164 |
| Cavan Gas | 0 | 0 | 0 | 0 |
| others | 0 | 0 | 0 | 0 |

Note: **Cavan Gas has zero notification rows**, so a manual run scoped to Cavan Gas would delete nothing and prove nothing. The dry-run should instead be a scoped, read-only count against K&N Gas Services (10 purgeable rows) so we can see exactly which rows would go before anything is deleted.

## Plan
1. **Migration**
   - Add `read_at timestamptz` (nullable) to `public.notifications`.
   - Add a `BEFORE UPDATE` trigger: when `is_read` changes false to true and `read_at` is null, set `read_at = now()`; when `is_read` changes true to false, clear `read_at`.
   - Add a supporting index on `(is_read, read_at)` for the cleanup query.
   - Add a `SECURITY DEFINER` function `public.purge_old_read_notifications()` that runs:
     ```sql
     DELETE FROM public.notifications
     WHERE is_read = true
       AND coalesce(read_at, created_at) < now() - interval '30 days';
     ```
     It returns the deleted row count so cron history shows the effect. Execute is granted to no application role (cron/postgres only).

2. **Dry run before scheduling** — run the exact `SELECT` counterpart of the DELETE, scoped to K&N Gas Services, and confirm every candidate row has `is_read = true` and an age over 30 days, and that the unread count for that org is unchanged.

3. **Schedule** — only after the dry run is reviewed, register the cron job:
   ```sql
   select cron.schedule('purge-old-read-notifications', '30 3 * * *',
     $$ select public.purge_old_read_notifications(); $$);
   ```
   03:30 daily keeps it clear of the 09:00 messaging jobs.

4. **Post-enable verification** — re-check total/read/unread counts per org and confirm unread totals are identical to the pre-run numbers above.

## Safety
- The DELETE only ever matches `is_read = true`; unread rows are never touched at any age.
- No changes to `useNotifications.ts`, `NotificationBell.tsx`, or any read/write path — the trigger is server-side only.
- The badge count from BJ-0053a keeps working; purging read rows cannot change an unread count.
