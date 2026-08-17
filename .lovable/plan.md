# BJ-0053a: Fix notification badge undercount

## Goal
Make the notification bell badge reflect the true unread count for the current user, instead of "unread within the most recent 50 rows."

## What to change
Only `src/hooks/useNotifications.ts`. `NotificationBell.tsx`, `AppLayout.tsx`, and `EngineerLayout.tsx` stay untouched.

## Implementation
1. Add a new state variable `unreadCount` initialized to `0`.
2. Add a dedicated async function `fetchUnreadCount()` that queries:
   ```ts
   const { count } = await supabase
     .from("notifications")
     .select("*", { count: "exact", head: true })
     .eq("recipient_user_id", user.id)
     .eq("is_read", false);
   ```
3. Call `fetchUnreadCount()` inside the existing `fetchNotifications()` flow on initial load (after the list fetch or in parallel).
4. In the Realtime INSERT handler, increment `unreadCount` by 1 when a new row arrives for the current user.
5. Update `markAsRead` to decrement `unreadCount` by 1 only when the marked row was previously unread.
6. Update `markAllRead` to set `unreadCount` to `0`.
7. Update `dismiss` to decrement `unreadCount` by 1 if the dismissed row was unread; if the delete fails and `fetchNotifications()` is called, also refetch the count.
8. Keep the existing 50-row limit for `notifications` (dropdown list) unchanged.
9. The returned `unreadCount` is still rendered by `NotificationBell.tsx`, which already caps display text at "99+"; only the underlying number becomes accurate.

## Verification
- For a user with more than 50 unread notifications, confirm the badge shows the true unread total (or "99+" if above 99), not a number capped around 50.
- Confirm marking one read decrements the badge.
- Confirm mark-all-read resets the badge to 0.
- Confirm a new incoming notification increments the badge.

## Risk
Low. Pure frontend count fix in one hook; no schema, auth, payment, or scheduling changes.
