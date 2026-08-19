# Notification Badge — Accurate Unread Count

## Goal

The bell badge currently counts unread rows inside the 50-row drawer fetch, so it caps out (48 shown while the table holds 269 unread). Give the badge its own server-side count that is not limited by the drawer window.

## Scope

`src/hooks/useNotifications.ts` only. The 50-row fetch feeding `NotificationDrawer` stays exactly as it is — same select, same order, same limit, same list contents. No styling, colour, or font changes anywhere.

## Changes

1. Add a count-only query using the pattern already used in `useUnreadMessages.ts` and `AppLayout.tsx`:
   `.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", user.id).eq("is_read", false)`
   The explicit `recipient_user_id` filter is kept deliberately — the SELECT policy allows org-wide reads for admin/owner/office, so dropping it would inflate the badge for those accounts.
2. Store the result in state and return it as `unreadCount`, replacing the current `notifications.filter(n => !n.is_read).length` derivation.
3. Keep it in sync:
   - initial load (alongside the existing fetch)
   - realtime INSERT → optimistic `+1`, then re-run the count
   - `markAsRead` → optimistic `-1` (floored at 0), then re-run the count
   - `markAllRead` → set to 0, then re-run the count
   - `dismiss` → this deletes the row; decrement only when the deleted notification was unread, then re-run the count (and re-run on the existing error/rollback path too)
   The re-run always reconciles against the server, so the badge cannot drift.
4. `NotificationDrawer`, the 50-row fetch, and which notifications are displayed are untouched.

## Verification

- Query the true unread total with the same filters and confirm the badge matches it (expected: well above 50) for the test account.
- Mark one item read from the drawer → badge drops by exactly 1, including when unread rows exist outside the visible 50.
- Insert a notification for the account → badge increments by 1 via realtime.
- Confirm an admin/office account's badge reflects only its own unread rows, not the org-wide total.
- Confirm the drawer still lists the same 50 most recent items.
- Typecheck plus the existing unit suite.

## Technical notes

- One `useCallback` count helper reused by every path; guarded on `user`.
- Optimistic adjust + reconcile avoids a visible lag on tap while keeping the server as source of truth.
- `dismiss` already rolls back via `fetchNotifications()` on delete failure; the count refresh hooks into the same path.
