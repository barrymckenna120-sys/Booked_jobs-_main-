# Office onboarding tour — desktop redesign

## Findings (requested before changes)

1. **Files and trigger**
   - `src/components/OnboardingTour.tsx` shows both the office and engineer tours. It holds the step lists, intro, feedback and thanks screens, and the bottom `Sheet` wrapper.
   - `src/hooks/useOnboardingTour.ts` decides when the tour opens. It sets `showTour = true` when `profiles.onboarding_complete` is false and the matching localStorage flag is not set. Office users get the office tour; users with role `engineer` get the engineer tour.
   - The office tour is mounted in `src/components/layout/AppLayout.tsx` (line 426). The engineer tour is mounted in `EngineerLayout.tsx`.
   - Finish, Skip and Close all call `markComplete()`. This sets the localStorage flag and `onboarding_complete = true`.

2. **Why the page behind looks blank (cause likely, not yet confirmed)**
   - Each step calls `navigate(currentStep.route)`, which moves the whole app to a new page (/dashboard, /schedule, /incoming and so on).
   - The tour has no backdrop. It is only a white sheet fixed to the bottom of the screen, so whatever is behind it is the new page while it loads.
   - A freshly opened page first shows its loading or empty state on the pale background (`bg-background`), so it looks like a blank off-white page.
   - First build step: open the tour at 1440px and screenshot it to confirm this before relying on it.
   - The fix does not depend on that check. On desktop the new tour stops changing pages, so the page the user was on stays visible under the dimmed backdrop.

3. **Replay from Help does not exist yet.** The hook has `startTour`, but nothing calls it, and the header's Help button opens "Report an issue". Keeping the "replayable from Help" requirement means adding one entry. Proposal: a "Replay tour" item in the office header's overflow or Help menu that calls `startTour`. This is the only change outside the tour.

## What gets built

- **New file `src/components/onboarding/officeTourSteps.ts`**
  - One config array with the 7 steps. Each step has id, number, label, title, body, 3 benefits (title plus a one-line description), image path (`/tour/<id>.webp`) and alt text.
  - Step text is copied exactly from the brief. The brief only gives benefit titles, so each benefit's one-line description is written by me and flagged for you to check.
  - The array can be reused by the mobile tour later.

- **New file `src/components/onboarding/OfficeTourDesktop.tsx`**
  - A centred dialog, 960px max width, over a `rgba(15,23,42,0.5)` backdrop.
  - Top row: 7 clickable numbered tabs. The active tab is solid brand blue; the others are white with a border.
  - "Skip tour" link in the top-right corner, always fully visible.
  - Two-column body:
    - Left, about 55%: a 16:10 image slot with 12px corners and a soft shadow.
    - Right: a blue label ("0X · STEP NAME"), the headline, the body text, and 3 benefit rows with check icons.
  - Footer: Back (outline) and Next (solid blue). The last step's button says "Finish".
  - Image placeholder: until the images exist, a pale-blue box says "Screenshot: <Step name> — to be added". Real images use `loading="lazy"`, and the next step's image is preloaded.
  - Keyboard: left and right arrows change steps, Esc skips. No auto-advance.
  - Built on the existing Radix Dialog, which gives `role="dialog"`, `aria-modal`, `aria-labelledby` pointing at the headline, focus trapped in the dialog, and focus returned to the page on close.
  - When the user has reduced motion turned on, there are no slide or fade transitions.
  - The dialog never changes pages.

- **Edit `OnboardingTour.tsx`**, minimal: when `tourType === "office"` and the screen is 768px or wider, show `OfficeTourDesktop` instead. Finish goes through the existing `onComplete` and Skip through `onSkip`, so `onboarding_complete = true` is written exactly as today. The mobile sheet, the engineer tour, and the intro and feedback screens stay as they are for mobile.
  - **Question:** should the desktop Finish still go on to the existing star-rating feedback screen, or finish straight away? My default is to finish straight away.

- **Replay entry** (see finding 3): one menu item in `AppLayout.tsx` that calls `startTour`.

## Checks
- Screenshots at 1440px of steps 1, 4 and 7. Confirm the app is visible behind the backdrop and Skip is fully visible.
- Keyboard: arrows, Esc, and focus returning to the page on close.
- Reduced motion turned on.
- At 390px the mobile sheet is unchanged, and the engineer tour is unchanged.
- Read back `profiles.onboarding_complete` after Finish, using a test-tenant (Cavan) user only.
- Type check and build.
- Report the files changed and the commit hash on dev.

## Risk
Low, UI only. The only data write is the existing `onboarding_complete` flag, unchanged. No database, backend function or RLS changes.
