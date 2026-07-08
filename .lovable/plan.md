## Scope (approved additions + one correction)

### Correction: `useNotifications.ts` already fetches on mount
`src/hooks/useNotifications.ts:70-85` already runs `fetchNotifications()` on mount — it selects the latest 50 rows for `recipient_user_id = user.id` ordered by `created_at DESC`, and `unreadCount` is derived from `notifications.filter(n => !n.is_read).length`. So the "bell doesn't show 78" symptom is **not** caused by a missing initial fetch. Adding a second fetch would be duplicative.

Two real possibilities remain for the "no badge" observation:
- **A)** Nicole is signed into the app under her `admin` engineer row (`auth_user_id = b646f6de-843e-4d3f-ab1d-245573f38d94`), NOT the `office` row (`574c0743…`). All 78 unread rows belong to the `574c0743…` account. Under `b646f6de…` the bell would legitimately be empty. There are two `nicole` engineer rows in org `8c37827f…`:
  - `5473f748…` role=admin, auth=`b646f6de…`
  - `1d836c8a…` role=office, auth=`574c0743…`
- **B)** The office session's `user` is briefly `null` on paint, and the badge only renders when `unreadCount > 0` — but a subsequent render should still show the count after the fetch resolves.

The diagnostic `console.log`s below will confirm which user id the office session is actually running under.

## Changes to apply

1. **`src/components/messages/MessageAlertBanner.tsx`** — add one line as the first statement in the postgres_changes callback, before the type filter:
   ```ts
   console.log("[MessageAlertBanner] notif received", { type: n.notification_type, id: n.id, recipient: n.recipient_user_id });
   ```

2. **`src/hooks/useNotifications.ts`** — add two lines:
   - Inside the postgres_changes handler, first line:
     ```ts
     console.log("[useNotifications] realtime insert", n.notification_type, n.id, "recipient:", n.recipient_user_id);
     ```
   - Inside `fetchNotifications`, after `setNotifications(...)`:
     ```ts
     console.log("[useNotifications] initial fetch", { userId: user.id, rows: (data ?? []).length, unread: (data ?? []).filter((n: any) => !n.is_read).length });
     ```

3. **Insert one test `job_messages` row** to exercise the trigger end-to-end:
   ```sql
   INSERT INTO job_messages (job_id, sender_id, sender_role, message)
   VALUES ('7aedc214-7639-4ca9-ba2f-96615664cc82',
           '57ebf8de-b2d3-44bc-90b0-071d750a3f46',
           'engineer',
           'Trigger test — please ignore');
   ```
   (KN-402 job id / Karl's auth id.)

4. **Verify** by reading `notifications` immediately after the insert for `notification_type='message'` and `job_id=7aedc214…`. Report:
   - Row ids + which recipients received it (expect both nicole rows plus any other admin/office/owner with `auth_user_id` in the org).
   - Any error surfaced by the trigger.

### Not changing
- No trigger changes (`notify_on_job_message` and `notify_on_job_change` are correct and firing).
- No fetch logic changes in `useNotifications.ts` — initial fetch already exists.
- No other files.
