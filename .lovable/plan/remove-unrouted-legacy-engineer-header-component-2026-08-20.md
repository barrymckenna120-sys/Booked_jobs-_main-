# Remove Unrouted Legacy Engineer Header Component

## Goal
Delete `src/pages/EngineerApp.tsx` — confirmed unrouted legacy code carrying the old greeting/gradient header UI that was removed from `EngineerLayout.tsx` in commit `68d92963`. Removing it prevents accidental future re-import or reintroduction of the old header.

## Verification already done
- `rg` search found zero references to `EngineerApp` anywhere in `src/`.

## Change
Delete `src/pages/EngineerApp.tsx` entirely. No other files touched.

## Post-change verification
1. Confirm the file no longer exists (`ls` / `git status`).
2. Run TypeScript typecheck to confirm nothing was importing it.
3. Screenshot the four engineer routes (`/engineer/today`, `/engineer/upcoming`, `/engineer/completed`, `/engineer/parts`) to confirm zero visible effect.
