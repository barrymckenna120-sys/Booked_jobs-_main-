# Tour close control

## What this should do
Every Office and Engineer tour pop-up will show a clearly visible, mobile-sized X in its top-right corner. Pressing it, clicking the existing backdrop where supported, or pressing Escape on desktop will immediately close the overlay and leave the user on their current BookedJobs screen.

## Implementation
- Reuse one close-button presentation across the mobile intro, all mobile steps, feedback, and the desktop tour.
- Connect close to the existing non-navigation tour exit callback; preserve wording, step order, completion, and skip behaviour.
- Keep the control above tour content, with a 44px target and safe-area-aware top placement on mobile.
- Preserve desktop backdrop dismissal and add explicit Escape handling.
- Add regression coverage confirming every Office and Engineer phase exposes the close control.

## Verification
- Exercise every Office and Engineer step at 390px and 1280px.
- Confirm X visibility, immediate overlay removal, current-page preservation, desktop Escape, and backdrop dismissal.
- Run focused tests and confirm the preview build is clean.
