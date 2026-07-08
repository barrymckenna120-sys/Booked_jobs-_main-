## Problem

The "Unblock User" button is already rendered in the Actions cell (AdminPanel.tsx line 825) directly after the tenant Block/Unblock button, but the Actions cell holds 4 buttons on a single non-wrapping flex row (`flex items-center gap-2` at line 788). On the Dublin Gas row (and any narrow row/viewport), the row overflows horizontally and the Unblock User + activity buttons get pushed off-screen. The button appears "missing" but is only clipped.

## Fix (single, minimal change in `src/pages/AdminPanel.tsx`)

1. In the Actions `TableCell` container (line 788), change `flex items-center gap-2` → `flex flex-wrap items-center gap-2` so buttons wrap onto a second line instead of overflowing off-screen. This guarantees the Unblock User button is always visible for every tenant row, including Dublin Gas, without horizontal scrolling.

2. Reorder within the same cell so the Unblock User button sits immediately next to the Block/Unblock tenant button (it already does at lines 825–832 — no change needed, just confirming placement).

3. Keep the trigger button label + icon exactly as-is (`<Unlock/> Unblock User`, `size="sm" variant="outline"`) so it visually matches the neighbouring Block button.

No other changes:
- `UnblockUserPopover` component (lines 94–231) untouched.
- `list-users` Edge Function untouched.
- No other rows, columns, or styles modified.

## Verification

- Load `/admin` as superadmin, confirm the "Unblock User" button is visible on both the K&N Gas Services and Dublin Gas rows without horizontal scrolling (may wrap onto a second line inside the Actions cell on narrower widths).
- Click it on Dublin Gas → popover opens and lists users for that org (existing wiring).
