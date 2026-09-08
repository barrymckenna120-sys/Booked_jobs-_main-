# Mobile Redesign — Office + Engineer Workspaces (mobile only)

Bring the phone experience of both workspaces up to the reference mockup's clarity: one shared header architecture, visible workspace identity, an obvious workspace switch, tidier cards and bottom navigation. Desktop and tablet stay exactly as approved — every change is behind mobile-only styles.

## Reference mockup details to match

Taken from the attached mobile reference (structure and quality, not its sample data):

- Header row: small rounded logo mark with tiny "BookedJobs" caption, a bordered white workspace control reading "Office"/"Engineer", then a blue-outlined switch button ("Engineer" with a tool icon / "← Office"), a bell with a red count, and a vertical "more" dots button.
- Office greeting block: large two-line greeting, muted full date beneath, and the blue `+ New Job` button aligned right on the same block (not in the header).
- Tabs row: underlined blue active tab, plain grey inactive labels, amber/orange count badges beside Follow-ups and Parts.
- KPI cards: 2×2 grid, soft tinted rounded icon tile top-left, small uppercase context label with chevron top-right, very large number, muted label under it.
- Full Schedule card: title with "N job · N done · N remaining" subline, blue "View calendar ›" link, grey uppercase time-band rows, then customer name, address with pin, amount and status pill, chevron.
- Engineer page: "Today's Jobs" title with a soft blue "N left" pill; job card outlined blue with "NEXT JOB" pill and status pill, big Job Ref line, customer name with chevron, address with pin, then metadata pills (date · slot, service type, product), plain metadata lines for Last Service/Engineer/Assisting, three equal white bordered buttons (Call / WhatsApp in green / Nav), a full-width white Details button, one dark full-width Certificates button, then plain rows with icon + label + chevron for Service History, Notes, Photos & Videos.
- Bottom nav: light surface, icon over small label, blue active item, small count badges on the icons.

## What changes on screen

### Shared mobile header (both workspaces)
- One compact 56–64px header: logo mark (24–28px) → workspace identity → workspace switch → notifications → one "More" menu.
- Consistent padding, alignment, 18–20px icons, 44px tap areas, subtle bottom border, light neutral surface.
- New small shared pieces: a mobile header shell, a compact workspace identity label, and a workspace-switch control used identically in both apps. No pill unless needed for spacing or contrast; prefer plain text or a very subtle container.
- There must be exactly one visible mobile workspace-switch control at any time. It reflects the current workspace and the existing permission state, and is never shown to a user who is not authorised to use it.

### Office mobile
- Header priority at narrow widths: logo → workspace identity → workspace switch → bell → More. New Job remains immediately accessible in the existing mobile action area, but must not cause header crowding or wrapping.
- Settings, Report a Bug and Sign Out move into the single More menu — nothing is removed.
- Tabs (Dashboard / Follow-ups / Parts) get better spacing, no awkward wrapping at 320px, clearer blue active state, badges kept.
- KPI cards: tighter height and padding, number as the dominant element, semantic colour only (blue info, orange upcoming, red overdue). Same four cards, same destinations.
- Full Schedule, Needs Attention, Jobs Update, Today's Revenue, Sales Report: spacing/hierarchy only — customer name first, address second, status and amount scannable, chevron visible. Same queries, ordering, loading and empty states.
- Five-item bottom nav destinations, labels, routes, badge behaviour and order remain unchanged; only visual sizing, spacing, icon treatment and active-state styling may change.

### Engineer mobile
- The solid blue gradient header is replaced by the same light header. Always visible: logo, "Engineer", Office switch (still gated by the existing office-access check), bell, More. Behind More: Order Parts, Report a Bug, Sign Out.
- Job card keeps every field, action and section; hierarchy is restructured: status → job ref → customer → location → date/service metadata → engineer/assist → Call/WhatsApp/Nav → Details/Certificates → collapsible sections.
- Button language: one primary blue action, white bordered secondary, subtle informational, red only for destructive. No four equally dominant buttons.
- Collapsible rows (Service History, Notes, Photos & Videos, Messages) get one consistent row treatment with icon, label, chevron.
- Bottom nav destinations, labels, routes, badge behaviour and order stay unchanged; fixed, safe-area aware, only sizing/spacing/icon/active-state styling changes.

## Files expected to change
- `src/components/layout/AppLayout.tsx` — mobile header block, More menu, bottom nav styling.
- `src/components/engineer/EngineerLayout.tsx` — mobile header replacement, More menu, bottom nav styling.
- `src/components/shared/` — new `MobileHeader.tsx`, `WorkspaceIdentity.tsx`, `WorkspaceSwitchButton.tsx`, `HeaderOverflowMenu.tsx`; `AppLogo.tsx` mobile mark sizing.
- `src/pages/Dashboard.tsx`, `src/components/dashboard/DashboardStatCards.tsx`, `NeedsAttentionCard.tsx`, `TodayTimeline.tsx`, `JobsUpdateSection.tsx`, `TodaysRevenueCard.tsx` — mobile spacing/hierarchy classes.
- `src/components/engineer/EngineerJobCard.tsx` and `src/components/engineer/job-card/*` — card hierarchy and button tiers.
- `roadmap.md` — task entry.

## Technical notes
- Presentation only: no route, query, permission, hook, handler, workflow, modal/sheet, notification or state changes. `canAccessOffice` / `useUserRole` remain the single source of truth for switching; `useNotifications`, `useEngineerJobs` untouched.
- Responsive via existing Tailwind breakpoints (`md:` and the existing `xs`) — no device detection, no new state, no duplicated switch controls.
- Engineer desktop shell (`EngineerDesktopNav`, `md:` branches) and the office desktop sidebar/header are left byte-stable apart from mobile-scoped classes.
- Existing sidebar-footer switch/Sign Out stay; the mobile switch is the only mobile instance.

## Verification
- Authenticated Playwright pass on Office dashboard and Engineer today/job detail at 320, 375, 390, 430 and 768px: no horizontal overflow, no clipping, header fits, switch visible, bottom nav clears content.
- Desktop regression check at 1024, 1280 and 1440px.
- `npx tsgo --noEmit`, full Vitest suite, `git diff --check`, console-error check.
