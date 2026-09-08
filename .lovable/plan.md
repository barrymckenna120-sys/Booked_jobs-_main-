# Engineer Workspace Switch and Bug Utility Refinement

## What this should do
Make desktop movement between Office and Engineer consistent through a quiet sidebar-footer switch, and rename the Engineer header’s existing bug-report action so its label and icon match what it already does. Preserve mobile navigation and every existing handler, permission gate, route, dialog, and workflow.

## Confirmed current behavior
- Office exposes the Engineer switch in both mobile and desktop headers; its desktop sidebar footer currently contains only Sign Out.
- Engineer already places `Back to Office` in the desktop sidebar footer behind the existing office-access gate, while retaining its separate mobile switch behavior.
- The Engineer header’s existing Report Issue dialog is opened by a control labeled `Help` with a `LifeBuoy` icon.
- No additional `Switch to Office App` content control was found in the Engineer workspace.

## Implementation
1. Add a small shared desktop sidebar-footer switch component using the existing button system and semantic sidebar tokens.
   - Identical spacing, typography, alignment, border separation, hover treatment, and visual weight in both workspaces.
   - Compact 18–20px Lucide icon and destination-oriented wording.
   - Neutral/secondary navigation treatment, not a primary blue CTA.
2. Office desktop shell:
   - Add `Switch to Engineer` to the bottom-left sidebar footer using the current permission-gated `/engineer/today` navigation behavior.
   - Remove the duplicate Engineer switch from the desktop header only.
   - Keep the existing mobile Engineer switch unchanged.
   - Retain Sign Out in the footer as a separate existing utility.
3. Engineer desktop shell:
   - Replace the local footer switch markup with the same shared component.
   - Keep `Back to Office`, `/dashboard`, and the current `canAccessOffice`-derived gate unchanged.
   - Keep the existing mobile header and bottom navigation unchanged.
4. Engineer header utility:
   - Change the visible label to `Report a Bug` and replace `LifeBuoy` with Lucide `Bug` (or the closest existing bug-report icon).
   - Preserve the exact click handler, dialog instance, submission flow, permissions, and route behavior.
   - Keep the existing header height and utility sizing; allow only the label’s required width and retain spacing beside Alerts and Log Out.

## Validation
- Confirm desktop Office has exactly one switch in the sidebar footer and desktop Engineer has exactly one gated switch in the same position/style.
- Confirm mobile workspace switching and bottom navigation remain unchanged.
- Open the Engineer `Report a Bug` control and confirm the existing dialog/submission workflow is unchanged.
- Check permitted and restricted Engineer states, including absence of `Back to Office` without office access.
- Check 320, 375, 768, 1024, 1440, and 1920px for header/sidebar overflow, clipping, safe-area regressions, and duplicate controls.
- Run TypeScript checks, the existing test suite, targeted click-through, and browser console checks.

## Risk and scope
Low-risk presentation-only change across the two shared workspace shells plus one new shared footer control. No data, queries, permissions, routes, authentication, notifications, or business logic will change.
