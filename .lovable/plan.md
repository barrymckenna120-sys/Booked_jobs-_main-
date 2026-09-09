# Mobile Workspace Switch — Clarity Fix

## What this does
Removes the ambiguity in the mobile header where "Office" and "Engineer" look like two similar buttons and the blue one reads as "selected". After this change the current workspace is a plain, non-clickable label ("you are here") and the destination is the only tappable workspace control ("tap to go there").

Mobile-only presentation change. No routes, permissions, handlers, navigation logic, or workflows change. Desktop is untouched.

## Current behavior (confirmed)
- `MobileWorkspaceHeader` renders: Logo → identity + switch (centered pair) → bell → More.
- `WorkspaceIdentity` shows the current workspace as a bordered, boxed chip (44px) — visually similar to a button.
- `WorkspaceSwitchButton` shows the destination as a blue-tinted filled chip (`bg-primary/5`, `border-primary/40`) — reads like a selected state.
- Office: identity `Office` (Briefcase icon), switch `Engineer` → `/engineer/today`, gated by `canSwitchToEngineer`.
- Engineer: identity `Engineer` (Wrench icon), switch `Office` → `/dashboard`, gated by `canSwitchToOffice` (canAccessOffice/office/admin). Restricted engineers see no switch.

## Changes

### 1. `WorkspaceIdentity.tsx` — current workspace as a plain label
- Remove the bordered/boxed chip container entirely.
- Render as plain text: icon + label in navy/charcoal (`text-foreground`), icon in muted tone.
- Keep 11px bold label and ~20px icon, no background, no border, no hover state, no cursor/click affordance. Not a button — it already isn't one; styling will now make that obvious.

### 2. `WorkspaceSwitchButton.tsx` — destination as the single clear control
- Outlined secondary treatment: white/transparent background, subtle border (`border-border`), blue text + icon (`text-primary`), rounded-lg.
- Keep 44px min height/touch target, ~20px icon, compact horizontal padding, pressed state (`active:bg-muted` or similar).
- No filled blue background — clearly distinct from the `+ New Job` primary CTA and from the identity label.

### 3. Destination icons/wording
- Office → Engineer: keep `Engineer` label with the Wrench/tool-style icon.
- Engineer → Office: switch icon from `Briefcase` to `ArrowLeft` so it reads "back to Office" (per request); label stays `Office`. Change lives in `EngineerLayout.tsx` (icon import/prop only) — handler, gate, and route unchanged.
- Short labels only ("Office" / "Engineer") — the header is too tight at 320px for "Switch to Engineer"; the arrow/icon carries the direction meaning.

### 4. Header layout (`MobileWorkspaceHeader.tsx`) — fit check only
- Keep order `Logo | identity + destination | bell | More`, no wrap, no clipping.
- Identity no longer needs 44px min-height/box, freeing width; keep the switch shrinkable with truncation as today.

## Files changing
- `src/components/shared/WorkspaceIdentity.tsx` — plain-label styling.
- `src/components/shared/WorkspaceSwitchButton.tsx` — outlined secondary styling.
- `src/components/engineer/EngineerLayout.tsx` — `ArrowLeft` icon for the Office switch (presentation only).
- `src/components/layout/AppLayout.tsx` — only if icon/label tweak is needed for the Engineer switch; otherwise untouched.
- `roadmap.md` — task entry.

## Validation
- Playwright authenticated pass at 320, 375, 390, 430px on Office dashboard and Engineer today:
  - current workspace reads as a label, destination as the single outlined control
  - no header wrap, clipping, or horizontal overflow
  - exactly one visible workspace switch; none in More menu, bottom nav, or content
  - restricted engineer: no Office switch visible
- Desktop regression spot-check at 1024/1440px (desktop shells untouched).
- `npx tsgo --noEmit`, Vitest suite, `git diff --check`.

## Risk
Low — presentation-only edits to three shared mobile components plus one icon prop. Gating, routes, handlers, and the More menu are unchanged.
