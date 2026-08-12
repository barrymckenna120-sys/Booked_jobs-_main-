# Engineer UI Improvements — Primary Actions & Header Parts Button

## Goal
Two small, independent UI changes on the engineer interface:
1. Collapse secondary job-card actions behind a toggle to reduce visual clutter.
2. Add an "Order Parts" shortcut in the engineer header.

---

## Task 1 — Collapse Cancel/No Access/Parts Needed in PrimaryActions

### File
`src/components/engineer/job-card/PrimaryActions.tsx`

### Scope
Only the `In Progress` and `parts_needed` / `parts_ordered` render branches. `Scheduled` / `Booked` / `En Route` / `On Site` remain untouched.

### Changes
1. Add local state inside `PrimaryActions`:
   ```ts
   const [showCantComplete, setShowCantComplete] = useState(false);
   ```
2. In the `In Progress` branch:
   - Keep the existing full-width `Complete` button exactly as-is (full width, `h-[52px]`, `bg-success`, `onClick={onComplete}`).
   - Below it, render a text link: "Can't complete this job?" (`text-sm`, `text-muted-foreground`, underline on tap/focus).
   - When tapped, reveal the existing Cancel / No Access / Parts Needed row layout with identical handlers, styling, and conditional rendering.
3. Apply the same structure to the `parts_needed` / `parts_ordered` branch:
   - Keep the existing full-width `Complete` button.
   - Add the same toggle link below it.
   - Reveal the existing Cancel / No Access row layout when toggled.
4. No changes to `PrimaryActionsProps`, no new props, and no changes to handler logic.

---

## Task 2 — Add "Order Parts" Button to Engineer Header

### File
`src/components/engineer/EngineerLayout.tsx`

### Changes
1. Import `Package` from `lucide-react` alongside the existing header icons.
2. In the header button row (lines ~144-168), add a new button between the existing "Back to Office" button and `NotificationBell`:
   - Label: "Order Parts"
   - Icon: `Package`
   - Styling matches "Back to Office": `text-white/70 hover:text-white active:text-white`, `text-xs font-semibold`, `min-h-[44px]`, `px-2`, flex with gap.
   - `onClick={() => navigate("/engineer/parts")}`
   - Not gated on `canSwitchToOffice` or `canAccessOffice` — visible to all engineers.
3. Leave Back to Office, NotificationBell, and Log Out unchanged.

---

## Verification
- Engineer preview: confirm Order Parts button navigates to `/engineer/parts`.
- Confirm Complete button remains primary and always visible on `In Progress` / `parts_needed` / `parts_ordered` cards.
- Confirm "Can't complete this job?" toggle reveals/hides secondary actions.
- Confirm no regressions in other status branches or header layout.
