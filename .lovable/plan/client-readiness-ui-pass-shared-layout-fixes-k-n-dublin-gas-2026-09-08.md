# Client-Readiness UI Pass — Shared Layout Fixes (K&N / Dublin Gas / Cavan)

All four issues trace to a handful of shared components. Every fix below is made once, in a shared place, so all tenants get it automatically.

---

## Issue 1 — Content cut off past the right edge

### What was found

Three separate causes, all in shared code:

1. **Engineer job card action row** — `src/components/engineer/job-card/QuickActions.tsx:38-51`
   Four buttons in a single non-wrapping `flex` row, each `flex-1` but with no `min-w-0`, and each label is non-wrapping text. Their combined intrinsic minimum width is wider than a 390px phone, so the row pushes the whole engineer shell (`EngineerLayout.tsx:87`, `max-w-[430px]`) wider than the viewport. That is why "Details" is clipped **and** the page itself is scrolled sideways (which is also what clips the logo in Issue 3).

2. **Office Jobs status filter chips** — `src/pages/Jobs.tsx:726-736`
   A horizontally scrollable row (`overflow-x-auto no-scrollbar`) with `shrink-0` chips. It scrolls correctly, but the scrollbar is hidden and there is no fade or edge cue, so the 4th chip reads as broken ("P…") rather than "swipe for more".

3. **Settings tab strip** — `src/pages/Settings.tsx:214`
   Same pattern: 14 tabs in `overflow-x-auto` with `whitespace-nowrap`, no scroll affordance, so labels look truncated rather than scrollable.

### Proposed fix

- **Action rows wrap instead of clipping.** In `QuickActions.tsx`, allow the row to wrap to a second line on narrow screens and give each button `min-w-0` with a sane minimum basis, so all four stay fully readable and nothing overflows the shell. No change to what the buttons do.
- **One shared scroll-row component** (new, `src/components/shared/ScrollRow.tsx`): a horizontal scroller with a right-edge gradient fade that appears only while more content exists to the right (and a left fade once scrolled). Adopt it for the Jobs filter chips and the Settings tab strip — the two shared row patterns — so cut-off content always reads as intentionally scrollable.
- **Overflow guard**: add `min-w-0` to the engineer shell content column and the office main content column so no future child can push the page sideways.

Touches: `QuickActions.tsx`, new `ScrollRow.tsx`, `Jobs.tsx` (chip row markup only), `Settings.tsx` (tab strip markup only), `EngineerLayout.tsx` / `AppLayout.tsx` (guard classes only).

---

## Issue 2 — Header icon row not uniform

### What was found

`src/components/layout/AppLayout.tsx:289-342` (mobile bar) and `:200-231` (desktop sidebar header) build each control inline and by hand:

- Icon sizes mix `w-4 h-4` (Engineer View hammer) and `w-5 h-5` (others).
- Spacing is `gap-1.5` on mobile but `gap-1` on desktop.
- Tap targets are `p-2` around a 20px icon ≈ 36px — under the 44px minimum.
- Sign Out uses a shadcn `Button variant="ghost" size="icon"`, everything else uses raw `<button>` — different hover, focus and radius.
- Active state exists only on the gear (`text-primary bg-primary/10`); the notification bell and others have no equivalent, which is the inconsistency in the screenshots.

### Proposed fix

Add one shared `HeaderIconButton` component (`src/components/shared/HeaderIconButton.tsx`) that fixes icon size, stroke width, 44x44 minimum tap area, radius, hover and a single `active` treatment. Replace every control in both the mobile bar and the desktop sidebar header with it, including Sign Out and the notification bell wrapper, and standardise spacing to a single value in both places. Behaviour, routes and the New Job button are unchanged.

Touches: new `HeaderIconButton.tsx`, `AppLayout.tsx`, `NotificationBell.tsx` (styling props only).

---

## Issue 3 — Logo clipping and sizing on mobile

### What was found

- The clipping in the screenshot is a **symptom of Issue 1**: the page is scrolled horizontally, so the sticky header slides left and the logo is cut. Fixing the overflow removes the clipping.
- Independently, the logo is inconsistent: the office header uses a remote Cloudinary URL with `className="h-8"` and no width bound (`AppLayout.tsx:200, 291`), while the engineer header uses a bundled square asset at `w-8 h-8` (`EngineerLayout.tsx:92`). The office one is a wide wordmark with no `max-w`, so it is the first thing squeezed when space is tight, and it renders small next to a five-icon row.

### Proposed fix

Add one shared `AppLogo` component (`src/components/shared/AppLogo.tsx`) that owns the source, a fixed height, `max-w-full`, `shrink-0`, and a compact icon-only mark below the narrowest breakpoint with the full wordmark above it. Use it in both headers so office and engineer views match and the wordmark is never squeezed illegibly.

Touches: new `AppLogo.tsx`, `AppLayout.tsx`, `EngineerLayout.tsx`.

---

## Issue 4 — Call / WhatsApp as real buttons everywhere

### What was found

Two competing patterns:

- **Correct:** `QuickActions.tsx:39-47` — bordered buttons, padding, rounded corners, 44px height.
- **Plain text links:** `src/pages/Jobs.tsx:587-592` (office Jobs mobile card), and the same pattern in `src/components/dashboard/DayJobsPanel.tsx`, `src/components/schedule/JobSlotDrawer.tsx`, `src/pages/DeclinedPayments.tsx`, `src/components/incoming/JobReviewPanel.tsx`.

### Proposed fix

Add one shared `ContactActions` component (`src/components/shared/ContactActions.tsx`) taking a phone number plus an optional compact size, rendering Call and WhatsApp with the engineer card's button styling, using the existing `formatWhatsApp` helper and existing `openExternalUrl` behaviour for iOS safety. Replace all five plain-text occurrences with it, and use it inside `QuickActions.tsx` so there is a single definition of the style.

Touches: new `ContactActions.tsx`, `Jobs.tsx`, `DayJobsPanel.tsx`, `JobSlotDrawer.tsx`, `DeclinedPayments.tsx`, `JobReviewPanel.tsx`, `QuickActions.tsx`.

---

## Flagged as bigger, separate scope

- **Settings tab strip on phones.** Fourteen tabs in a scroller works but is poor on a phone; converting it to a grouped list or dropdown picker is a redesign, not a quick fix. This plan only adds the scroll affordance.
- **Full logo asset rework.** A proper icon-only mark may need a real square asset; the plan uses the existing bundled square asset for compact mode. If you want a designed mark, that is separate.
- **Global 320px audit.** A previously noted stats-card overflow and cropped logo at 320px are pre-existing and outside these four issues.

## Verification

Authenticated Playwright checks at 320, 375, 390, 430, 768 and 1024px on Dashboard, Jobs, Settings, Schedule and the engineer Today screen: confirm zero document horizontal overflow, all four engineer action buttons fully visible, fade cue present on chip/tab rows, header tap targets at least 44px, logo never clipped, and Call/WhatsApp identical in every location. Plus typecheck and the full test suite.
