# Dashboard UI Redesign — Precision Service Dashboard

## Goal
Refine the existing office dashboard and shared office shell into the selected **Precision Service Dashboard** direction: crisp blue, calm neutral surfaces, clear navigation groups, and stronger operational hierarchy. Preserve all routes, queries, data, permissions, actions, loading behavior, and business logic.

## Confirmed current state
- Desktop utility actions—Engineer View, Help, Notifications, and Settings—currently sit above the navigation inside the fixed sidebar.
- Desktop navigation is currently one ungrouped list. Warranty is an active destination and will remain available under **Work**.
- Mobile already uses a fixed five-item bottom navigation and a compact top bar with New Job and utility controls; those workflows will be retained.
- The dashboard already follows the requested section order: KPI cards; Schedule + Needs Attention; Jobs Update + Revenue; Sales Report.
- The current dashboard components already have loading and empty states; these will be restyled rather than replaced.

## Implementation

### 1. Rework the shared office shell
- Keep the tenant logo and **New Job** action at the top of the desktop sidebar.
- Move Engineer View, Help, Notifications, and Settings into a compact top-right desktop header, using the existing shared icon-button, drawer, dialog, and guarded navigation behavior.
- Add subtle desktop navigation groups:
  - **Work:** Dashboard, Jobs, Pipeline, Customers, Warranty, Calendar
  - **Business:** Finance, Reports
  - **Operations:** Chat Inbox, Parts, Products
  - **System:** Admin, only when currently permitted
- Standardize all sidebar Lucide icons to one size, stroke, gap, and alignment; retain the existing blue active state with a light-blue surface.
- Keep Sign Out available without presenting it as primary navigation.
- Preserve the existing mobile top bar and fixed five-item bottom navigation, while aligning their surface, borders, spacing, and utility controls with the refreshed shell.
- Keep network/WhatsApp banners, safe areas, notification badges, unsaved-change guards, and permission gates unchanged.

### 2. Apply the selected visual system
- Use the selected crisp-blue palette through semantic tokens: light neutral canvas, white cards, navy-charcoal text, muted secondary text, and existing primary blue.
- Apply the selected refined heading/body typography within the redesigned office shell and dashboard without changing document/PDF typography or unrelated product areas.
- Standardize dashboard card radius, border, restrained shadow, internal padding, headings, number styles, badges, hover states, and 18–20px icon treatment.
- Avoid gradients, decorative effects, oversized controls, excessive pills, and raw component-level color values.

### 3. Refine the dashboard hierarchy
- Keep the greeting, date, Dashboard/Follow-ups/Parts tabs, Schedule action, and New Job action with their current behavior.
- Restyle the four existing KPI cards without changing their values or destinations:
  - New Incoming
  - Overdue Services
  - Due Soon
  - Incomplete Jobs
- Make icon containers consistent and reserve red/orange for genuine urgency; use blue for neutral information.
- Keep the responsive four-card desktop arrangement and sensible two-column/stacked behavior at smaller widths.

### 4. Improve Schedule and Needs Attention presentation
- Preserve the existing Full Schedule query, grouping, navigation, loading, and empty states.
- Make each job row easier to scan: customer first, address second, price aligned right, status badge, chevron, and a small status/time indicator with less border noise.
- Refine Needs Attention so Overdue Services, Due Soon, and Incomplete Jobs form the primary attention list.
- Present New Incoming Jobs as a visually separate incoming-work block within the same area, using existing counts and destinations only.

### 5. Harmonize secondary dashboard sections
- Keep Jobs Update’s three metrics and job list intact, but balance metric sizing and spacing.
- Keep Today / This Week / This Month controls and all revenue behavior intact; make the control compact and the no-payments state calm and neutral.
- Keep Sales Report as a full-width navigation row with its existing icon, title, subtitle, chevron, and destination.
- Retain deferred loading for Jobs Update and Revenue.

## Responsive behavior
- **Desktop:** full grouped sidebar, compact utility header, and balanced dashboard grid.
- **Tablet:** retain the sidebar at existing logical-width breakpoints, tighten spacing, and stack content only where needed.
- **Mobile:** preserve the five-item bottom navigation, safe areas, New Job access, utility access, and stacked dashboard cards.
- Use CSS breakpoints only; no device detection or separate desktop implementation.

## Verification
- Check 320, 375, 390, 430, 768, 834, 1024, 1194, 1280, and 1440px widths for overflow, clipping, readable labels, stable cards, and reachable actions.
- Confirm every sidebar/header destination, New Job, notifications, Help, Settings, tabs, KPI links, schedule rows, revenue controls, and Sales Report still perform their existing action.
- Verify loading, empty, populated, unread-badge, restricted-role, and superadmin navigation states.
- Confirm no console errors and no visual regression in the five-item mobile navigation.
- Run the TypeScript check and existing test suite; add no unit tests for pure styling unless presentation logic is extracted.

## Risk and scope
- **Risk level:** Low-to-medium UI risk because the shared office shell affects every office page; no backend or business-rule risk is introduced.
- **Shared regression surface:** sidebar width/content offset, top banners, mobile header/bottom navigation, notification drawer, New Job panel, guarded navigation, and role-gated Admin/Engineer View controls.
- **Explicitly excluded:** route changes, new metrics, new search/profile functionality, query changes, backend changes, permission changes, engineer-app redesign, and altered financial calculations.
