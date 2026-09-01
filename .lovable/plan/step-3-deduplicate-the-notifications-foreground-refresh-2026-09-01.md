# Step 3 — deduplicate the notifications foreground refresh

Step 1 (auth identity churn) is shipped and verified: the Jobs list, customers, quotes and profiles no longer refetch on tab return at all. The only remaining per-tab-return traffic is notifications, which still fires 4 requests per return instead of 2. Steps 2 and 4 are dropped as no longer needed.

## What's happening

One handler (`onForeground`) is registered on both `document`'s `visibilitychange` and `window`'s `focus`. A normal tab switch fires both events, and the handler does two reads each time (the notifications list GET and the unread-count HEAD), so every tab return costs 4 requests where 2 would do. Measured: 20 notifications requests across 5 hide/show cycles.

Both listeners exist on purpose — iOS suspends the realtime socket when the PWA is backgrounded, and the two events are not reliably interchangeable there — so the fix is to keep both registrations and drop the duplicate *work*, not a listener.

## Fix

Add a short "last refreshed" timestamp guard inside `onForeground`: if it already ran within the last ~2 seconds, return without fetching. The first of the two events wins and the second is a no-op, so a tab return does one list GET plus one unread HEAD.

Deliberately unchanged: both event registrations, the `visibilityState !== "visible"` early return, the realtime subscription, the initial fetch on mount, the sound/banner behaviour, and every other call site of `fetchNotifications` (marking read, dismissing, realtime inserts) — the guard lives only in the foreground handler, so an actual new notification still refreshes immediately.

## Verification

- Playwright on a real session: load a page, run 5 hide/show cycles, count `rest/v1/notifications` requests. Expect **10** total (1 GET + 1 HEAD per return), down from 20.
- Confirm the bell badge still updates: insert a notification while the tab is backgrounded, return to the tab, and check it appears and the unread count is correct — the guard must not swallow a genuine foreground catch-up.
- Confirm realtime still delivers a new notification with the tab in the foreground (toast/badge), unaffected by the guard.
- Regression click-through on the office shell (bell open, mark read, mark all read, dismiss) plus `/engineer/today`, and `tsgo --noEmit`.
- Add a unit test for the throttle rule: two calls inside the window do one refresh, a call after the window refreshes again.

## Technical notes

- `src/hooks/useNotifications.ts` lines 328-357: the `onForeground` effect registering both listeners; the guard goes at the top of that handler using a `useRef` timestamp (not state, to avoid re-render churn).
- Window of ~2000ms: comfortably longer than the gap between `visibilitychange` and `focus` on a tab switch, short enough that a deliberate tab-out-and-back to check for news still refreshes.
- No other file changes. Not touching `useEngineerJobs` (Step 4, dropped — it also owns job writes and would need the heavier process), the parts-badge poll, or the service-worker config.
