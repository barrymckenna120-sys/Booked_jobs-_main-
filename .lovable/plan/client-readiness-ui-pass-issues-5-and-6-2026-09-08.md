# Client-readiness UI pass — Issues 5 and 6

Both fixes live in shared components, so K&N, Dublin Gas and Cavan get them at once. Phone layouts stay exactly as they are today.

## Issue 5 — Header icons on desktop lack clarity

### Current behaviour
The office header controls sit in the shared sidebar top row and use one shared control (`HeaderIconButton`). Today they render icon-only at every width, with only a browser `title` attribute — which is unreliable and never shows on keyboard focus. The engineer header already shows labels from the small breakpoint up (Back to Office, Order Parts, Log Out), but the help and bell there are icon-only too, so the row looks uneven.

### Fix (both labels and tooltips, as chosen)
- Extend `HeaderIconButton` so it accepts a label and renders it as text from the tablet breakpoint up, hidden below that — one rule, so every header row is consistent instead of each caller hand-writing `hidden sm:inline`.
- Wrap the same control in the existing tooltip component so hovering or keyboard-focusing any header icon shows the label at every width, including where the text is hidden.
- Apply to the office sidebar row (Engineer View, Help, Notifications, Settings) and the engineer header row (Back to Office, Order Parts, Help, Notifications, Log Out), plus the shared notification bell so its unread badge and label stay aligned.
- Icon clarity: the life-buoy currently used for "Report an issue" is commonly read as "support/help" rather than "report a problem", and the hammer for Engineer View is fine but benefits from its label. With a visible label plus tooltip both become unambiguous, so no icon-set change is proposed — labels solve it without a new visual language.

Scope: small styling and props change in shared components, no layout restructure.

## Issue 6 — Engineer view responsive on desktop

### Current behaviour
The engineer shell is hard-locked to phone width: the outer wrapper and the fixed bottom nav are both capped at 430px and centred, so on a desktop browser the app is a narrow strip with large empty margins. That cap is what creates the "second design" feel — the content itself is ordinary stacked cards.

### Fix (wider, roomier cards — additive above tablet)
- Lift the width cap in the engineer shell so it grows on wider screens (comfortable reading maximum rather than phone width), keeping the 430px behaviour below the tablet breakpoint.
- Widen the bottom nav in step with the shell so it still lines up with the content instead of floating at phone width.
- Let the job cards use the extra room from the tablet breakpoint up: job details (address, date/slot, service type, appliance, engineer/assisting) laid out in two columns instead of one long stacked run, and the action row spread across the width rather than wrapping.
- Standard Tailwind breakpoints only, no new custom breakpoints. Nothing changes below the tablet width — same order, same actions, same behaviour, same tap targets.

Scope: moderate. It is a container and grid change in the shared engineer shell and job card, not a new layout or a second desktop view.

## Verification
- Check the office and engineer headers at 320, 375, 390, 430, 768, 1024, 1280 and 1440px: no overflow, labels appear only above the tablet width, tooltips work on hover and keyboard focus, 44px tap targets preserved.
- Check the engineer Today and job detail views at the same widths: phone rendering byte-identical in behaviour, wider screens fill the space, bottom nav aligned.
- Run the type check and the full test suite.

## Technical notes
- Touches: `src/components/shared/HeaderIconButton.tsx`, `src/components/shared/NotificationBell.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/engineer/EngineerLayout.tsx`, `src/components/engineer/EngineerJobCard.tsx` (and the shared job-card pieces under `src/components/engineer/job-card`).
- Tooltips use the existing `src/components/ui/tooltip.tsx`; a tooltip provider is added at the shell level if one is not already mounted.
- No changes to data fetching, job status logic, assist/lead gating, payments or permissions.
