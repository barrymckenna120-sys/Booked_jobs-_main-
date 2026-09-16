# Refine the Finance green header only

## What's changing

The green hero at the top of Finance → Overview (rendered by `src/pages/Finance.tsx`, lines 528–548) is restyled into a compact, restrained finance header card. Nothing below it, and no logic, changes.

## Current state (confirmed by reading the code)

- Full-bleed green gradient block with two translucent decorative circles and glass-style overrides (`bg-white/15` revenue card, white text-override classes on the View By control).
- The green block spans edge-to-edge of the page container while the content below has `px-4` padding — the misalignment visible in the screenshot.
- Revenue summary is a translucent white card with the revenue number in white.

## Changes — all inside the header block of `src/pages/Finance.tsx` only

1. **Green surface** — replace the gradient + circles with a flat light-green panel: `bg-success-light`, `border border-success/20`, `rounded-2xl` (same corner radius as the cards below). Navy/charcoal text from existing tokens. No gradient, no decorative shapes, no translucency.

2. **Page alignment** — the green panel sits inside the same `px-4` horizontal padding the content below uses, so its left/right keylines line up exactly with the Action Needed banner and revenue cards. It becomes a rounded card, not an edge-to-edge strip.

3. **Internal spacing** — `p-5 sm:p-6` (20–24px, within the 24–32px desktop target), and the overall height drops (no more `pt-10` hero padding). Row 1: left = period label (secondary, small, muted) above a dominant `Finance` heading; right = the existing `DateRangeToggle`. Row 2: the revenue summary card. No large empty green areas.

4. **View By / month navigation** — remove all the `[&_span]:text-white …` white glass override classes on the toggle wrapper. `DateRangeToggle` then renders its built-in neutral look (white card background, border, primary-coloured selected pill) — a compact segmented control with a clearly visible selected state. The component file itself is untouched, so Day/Week/Month behaviour, month navigation, and every other page using it are unchanged.

5. **Revenue summary** — compact white card (`bg-card border border-border rounded-xl`): small uppercase muted label (the period + "Revenue"), the revenue figure as the strongest element (`text-3xl font-black`, foreground ink), and the outstanding figure below in muted text. A small green trending icon in a soft green tile gives the semantic "positive revenue" green accent. Calculations, values and formatting untouched.

## What is NOT touched

- Everything below the green header (Action Needed, revenue/outstanding cards, payment breakdown, forecast, renewals, tables).
- `FinancePage.tsx`, routes, queries, financial calculations, date logic, handlers, loading/empty states, permissions.
- `DateRangeToggle.tsx` (shared component — used elsewhere; only the override classes in Finance are removed).
- No gradient utilities, no hardcoded decorative colours — existing semantic tokens only (`success`, `success-light`, `card`, `foreground`, `muted-foreground`, `border`).

## Verification

- Type checks pass; no unit tests needed (pure markup, no logic — per QA lite policy).
- Playwright screenshots of the Finance page at 1024, 1280, 1440 and 1920px plus mobile width, confirming: aligned page margins with the content below, no decorative circle, no glass/translucent controls, clear Day/Week/Month selected state, readable heading, visible revenue summary, no console errors.
- Confirm Sales tab and other pages using `DateRangeToggle` are visually unaffected.
