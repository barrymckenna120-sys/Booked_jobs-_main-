# Engineer Job Card Primary Actions — Collapse Secondary Actions

## Goal
Reduce visual clutter on the engineer job card by collapsing the Cancel/No Access/Parts Needed buttons behind a "Can't complete this job?" toggle, while keeping the Complete button always visible and primary.

## What will change
- File: `src/components/engineer/job-card/PrimaryActions.tsx`
- Only the `In Progress` and `parts_needed` / `parts_ordered` render branches.
- `Scheduled` / `Booked` / `En Route` / `On Site` branches remain untouched.

## Implementation details
1. Add local state inside `PrimaryActions`:
   ```ts
   const [showCantComplete, setShowCantComplete] = useState(false);
   ```
2. In the `In Progress` branch:
   - Keep the existing full-width `Complete` button exactly as-is (full width, `h-[52px]`, `bg-success`, `onClick={onComplete}`).
   - Below it, render a text link: "Can't complete this job?" (`text-sm`, `text-muted-foreground`, underline on tap/focus).
   - When the link is tapped, reveal the existing Cancel / No Access / Parts Needed row layout with identical handlers, styling, and conditional rendering.
3. Apply the same structure to the `parts_needed` / `parts_ordered` branch:
   - Keep the existing full-width `Complete` button.
   - Add the same toggle link below it.
   - Reveal the existing Cancel / No Access row layout when toggled.
4. No changes to the `PrimaryActionsProps` interface, no new props, and no changes to any handler logic (`onStatusChange`, `onComplete`, `onCancel`, `onNoShow`, `onPartsNeeded`).

## Verification
- Visual check in the engineer preview for `In Progress`, `parts_needed`, and `parts_ordered` jobs.
- Confirm Complete button remains primary and always visible.
- Confirm toggling reveals/hides the secondary actions.
- Confirm no regressions in other status branches.
