# Engineer Header Simplification — All Engineer Screens

## Goal

Strip the engineer app header back to a compact top bar containing only the BookedJobs logo/name, the notification bell with its real unread count, and the Order Parts button. Keep the existing overflow menu (Back to Office for managers, Log Out) unchanged. Remove the "Good Morning, [name]" greeting and the decorative full-height blue gradient panel from all four engineer screens (Today, Upcoming, Completed, Parts), since the header is shared.

## Scope

Purely visual/layout change in the shared engineer layout component. No data fetching, hooks, business logic, bottom navigation, or job cards are changed.

## Affected File

`src/components/engineer/EngineerLayout.tsx`

## Changes

1. Delete the `greeting()` helper, `formatDateHeading()` helper, and the `Hand` and `PartyPopper` imports.

2. Replace the full-height `bg-gradient-to-br from-primary to-primary-dark` panel and its decorative circular background elements with a compact top bar. Keep the top row structured exactly as today: logo/name on the left; Back to Office (managers only), Order Parts, NotificationBell with unreadCount, Log Out on the right.

3. Remove the date heading, greeting, and jobs-remaining/all-done status line.

4. Reuse the existing header background colour and existing button/icon components exactly as they render today — no new colours, fonts, font sizes/weights, or styling anywhere in this change.

5. Keep all hooks, state, data fetching, auth logic, the offline banner, notification drawer, sound prompt, notification banner, message alert banner, onboarding tour, and bottom navigation exactly as they are. Keep page content padding and safe-area handling unchanged.

## Verification

- Screenshot of /engineer/today, /engineer/upcoming, /engineer/completed, and /engineer/parts confirming the compact header renders consistently on all four.
- Confirm notification bell still shows the real unread count.
- Confirm Order Parts still navigates to /engineer/parts.
- Confirm manager overflow menu still shows Back to Office and Log Out — tap Back to Office and confirm it actually navigates, not just that the button is visible.
- Confirm bottom navigation and job cards are unaffected on all four screens.
