# Engineer View + Admin Shell — Desktop UX & Navigation Refinement

## Goal
Extend the approved Precision Service Dashboard shell language to Engineer and Admin without changing routes, permissions, queries, actions, workflows, notifications, loading/empty states, or mobile Engineer behavior.

## Confirmed current structure
- Engineer list routes are nested under the existing Engineer layout: Today, Upcoming, Completed, and Parts. Job Detail and Certificates are existing standalone Engineer routes.
- Engineer currently uses a centered `430px` mobile shell, widened only to `900px` for list pages; its bottom navigation remains present on desktop. Job Detail and Certificates are still capped at `430px`.
- Engineer’s existing workspace switch is an explicit `/dashboard` navigation gated by `canAccessOffice`; restricted engineers do not receive that option.
- Admin currently has two routes only: the main Admin page and Tenant Detail. The main page contains eight real sections as local tabs: Tenants, Customer Integrations, Messaging, Unblock Users, User Activity, Import Runs, Delivery Issues, and Support Reports.
- Admin and Tenant Detail enforce their existing superadmin checks independently and currently render without a persistent shell.
- Office already exposes Engineer View and Admin through its existing permission-gated controls. That routing and permission logic will remain authoritative.

## Implementation

### 1. Shared workspace shell language
- Add small reusable presentation primitives for desktop workspace identity, grouped sidebar navigation, active state, compact header utilities, and a footer workspace-switch action.
- Match Office’s established shell dimensions and tokens: neutral background, white surfaces, restrained borders/shadows, standard Lucide sizing/stroke, compact 64px header, and the existing blue active state.
- Keep workspace identity textual and subtle: `Office workspace`, `Engineer workspace`, or `Admin workspace`; no large badge or decorative treatment.
- Do not refactor Office routing or behavior. Reuse its visual conventions while limiting code changes to the new Engineer/Admin shell pieces and the shared controls they already use.

### 2. Engineer desktop and tablet shell
- Refactor `EngineerLayout` responsively:
  - `<768px`: preserve the current header, fixed bottom navigation, safe-area spacing, utility actions, notifications, and all mobile behavior.
  - `768px+`: show a persistent compact sidebar and top header; remove the desktop bottom bar; use the full canvas with a readable main-content maximum rather than a centered phone strip.
- Surface every existing Engineer destination in the desktop sidebar:
  - Work: Today, Upcoming
  - History: Job History, My Parts
- Preserve all current count badges and active-route rules, including Parts no longer being visually conflated with Completed in the desktop sidebar.
- Put the permission-gated `Back to Office` action in the sidebar footer as the workspace switch. Keep header utilities for Order Parts, Help, Alerts, and Log Out without duplicating the switch.
- Keep all existing notification drawers/banners, sound prompts, onboarding, offline state, auth loading behavior, and outlet context unchanged.

### 3. Engineer page and card responsiveness
- Preserve the current Today/Upcoming/Completed/Parts data and ordering while giving list pages a desktop content grid:
  - primary/next job remains dominant in the wider main column;
  - rest-of-day rows, daily counts, outstanding balances, and parts attention use a restrained secondary column only where space permits;
  - tablet collapses this progressively before mobile returns to the current single-column sequence.
- Refine `EngineerJobCard` for wider screens without reordering or changing actions:
  - clearer reference/customer/status header;
  - aligned schedule/location/engineer metadata;
  - compact consistent Call/WhatsApp/Nav/Details/Certificates and secondary controls;
  - desktop columns for read-only sections where content permits;
  - primary job-progress action remains strongest and assistant gating remains unchanged.
- Keep mobile card order, tap targets, sheets, fixed action behavior, and all existing completion/payment/cancellation/message/media workflows intact.

### 4. Engineer detail and certificates routes
- Apply the same responsive Engineer workspace frame to the existing standalone Job Detail and Certificates pages without changing their URLs or data flow.
- On desktop/tablet, replace the `430px` cap with a readable workspace layout: job identity and primary actions stay prominent, while existing detail sections can use wider/two-column presentation where safe.
- On mobile, preserve the current compact header, back behavior, tabs, safe-area spacing, and single-column sequence.
- Do not move, merge, rename, or alter Details, Certs, Service History, Notes, Photos & Videos, Messages, payment, or completion functionality.

### 5. Admin shell and persistent navigation
- Add an Admin shell around both existing Admin routes with the same visual system but clearly administrative identity: `[Logo] Admin` and `Admin workspace`.
- Convert the eight existing Admin tabs into persistent sidebar navigation state—no new destinations and no route changes:
  - Admin: Tenants, Customer Integrations, Messaging, Unblock Users, User Activity, Import Runs
  - System: Delivery Issues, Support Reports
- Keep the existing selected-tab state and callbacks as the source of truth. Sidebar selection changes the same current tab content; existing cross-tab actions such as “View Messaging” continue to work.
- Keep Tenant Detail within the Admin shell, retain its existing `Back to Admin` action/content, and show the persistent Admin navigation without duplicating or weakening its superadmin gate.
- Place an explicit `Back to Office` action in the sidebar footer, navigating to `/dashboard` rather than browser history.
- For narrow screens, use a compact Admin header plus an accessible menu/drawer for the same existing sections; do not force the desktop sidebar into phone width.

### 6. Permission and behavior preservation
- Reuse `useUserRole`, `useAdminViewAs`, current superadmin checks, and existing route handlers; do not create parallel role or workspace state.
- Render Engineer’s Office switch only under the existing `canAccessOffice` rule.
- Render Admin navigation only after the existing superadmin check resolves; unauthorized redirects stay unchanged.
- Preserve Office entry points, impersonation/View As behavior, notification counts, unsaved-change handling where already present, and all existing sign-out behavior.

## Technical scope
Likely touched areas:
- shared layout presentation primitives and existing shared logo/header controls only if needed;
- `EngineerLayout`, Engineer list pages/cards, Engineer Job Detail, and Engineer Certificates for responsive presentation;
- `AdminPanel` and `TenantDetail`, plus a focused Admin shell/navigation component;
- no backend, database, route-definition, query, permission, or business-logic changes.

## Verification
- Authenticated responsive checks at `320, 375, 390, 430, 768, 834, 1024, 1194, 1280, 1440, 1920px`.
- Engineer: Today, Upcoming, Job History, My Parts, Job Detail, and Certificates; active navigation, counts, utilities, Back to Office gating, fixed mobile bottom nav, safe areas, sheets/modals, and primary/assistant action visibility.
- Admin: all eight existing sections, Tenant Detail, Back to Admin, Back to Office, superadmin gating, View As flow, loading/empty states, and narrow-screen navigation.
- Office: quick regression check that Engineer/Admin entry points and the approved Precision Service Dashboard shell remain unchanged.
- At every width: no horizontal overflow, clipping, overlapping controls, nested unintended scroll areas, or console errors.
- Run TypeScript checks, the existing test suite, and final diff whitespace validation. Add tests only if responsive extraction introduces real conditional logic; pure styling changes do not need unit tests.

## Risk assessment
- **Risk level:** Medium. The changes are presentation-only, but Engineer actions and Admin controls are high-impact surfaces.
- **Main regression risks:** hiding a permission-gated destination, remounting tab content and losing local form state, duplicating notifications, or changing mobile action order.
- **Controls:** preserve existing component ownership/state, use CSS breakpoints only, avoid route/data refactors, and click through every existing destination at mobile and desktop widths.
