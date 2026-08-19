# Clear unread notifications for barrymckenna120@gmail.com

## Confirmed before acting

- Target user id: `ed429061-7b76-4272-af4a-25249ee6d719` (barrymckenna120@gmail.com, superadmin, K&N Gas Services).
- Current rows for that user: **148 total, 148 unread, 0 read**.
- No customer-facing history at risk: customers have no logins (they live in the `customers` table), and the one real-named engineer account (`lin_kearns@yahoo.co.uk`) has 0 notification rows. Point 2 is confirmed to the extent the data allows — this is an owner/admin account, not a live engineer's history.

## What will run

A one-off migration containing a single statement (the read tool cannot execute DML, so this goes through the migration path):

```sql
DELETE FROM public.notifications
WHERE recipient_user_id = 'ed429061-7b76-4272-af4a-25249ee6d719'
  AND is_read = false;
```

No other user id, no read rows, no schema changes, no policy changes, no frontend changes.

## After it runs

Re-query and report:
- rows actually deleted for that user
- remaining total / unread / read for that user (expected 0 / 0 / 0)
- unread totals for every other account, to confirm they are unchanged from the numbers already reported

## Note

Because all 148 rows are unread, this clears that account's entire notification list and its bell badge drops to 0. If you wanted to keep any of it, say so before approving.
