# Engineer Header Simplification — Today Screen

## Goal
Strip the engineer app header back to a compact top bar containing only the BookedJobs logo/name, the notification bell with its real unread count, and the Order Parts button. Keep the existing overflow menu (Back to Office for managers, Log Out) unchanged. Remove the large "Good Morning, [name]" greeting and the decorative full-height blue gradient panel.

## Scope
This is a purely visual/layout change in the shared engineer layout component. No data fetching, hooks, business logic, bottom navigation, or job cards are changed.

## Affected File
`src/components/engineer/EngineerLayout.tsx`

## Changes

1. **Remove unused header content**
   - Delete the `greeting()` helper.
   - Delete the `formatDateHeading()` helper.
   - Remove the `Hand` and `PartyPopper` imports.

2. **Simplify the header JSX**
   - Replace the full-height `bg-gradient-to-br from-primary to-primary-dark` panel and its decorative circular background elements with a compact top bar.
   - Keep the top row exactly as structured today:
     - Left: BookedJobs logo + "BookedJobs" text.
     - Right: Back to Office button (managers only), Order Parts button, NotificationBell with `unreadCount`, Log Out button.
   - Remove the date heading, the "Good Morning, [name]" greeting, and the jobs-remaining / all-done status line.

3. **Preserve everything else**
   - Keep all hooks, state, data fetching, and auth logic intact.
   - Keep the offline banner, notification drawer, sound prompt, notification banner, message alert banner, onboarding tour, and bottom navigation exactly as they are.
   - Keep page content padding and safe-area handling unchanged.

## Verification
- Visual check of `/engineer/today` to confirm the compact header renders correctly.
- Confirm notification bell still displays the real unread count.
- Confirm Order Parts button still navigates to `/engineer/parts`.
- Confirm manager overflow menu still shows "Back to Office" and "Log Out".
- Confirm bottom navigation and job cards are unaffected.

## Note
The header lives in `EngineerLayout.tsx`, which is the shared layout for Today, Upcoming, Completed, and Parts. This change will therefore apply to all engineer screens, not only Today. If the simplified header should be Today-only, a separate Today-specific header component would need to be created instead.
