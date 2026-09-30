# Private Help & Training Centre — V1 (audit + build plan)

Additive only. No changes to auth, RLS, roles, jobs, payments, WhatsApp, scheduling. No database migration.

## Audit answers (spec section 20)

A. Reuse: existing shadcn cards/accordion/dialog, Lucide icons, `MobileWorkspaceHeader`, engineer and office layouts.
B. Auth guard: `useAuth()` — already redirects signed-out users to `/auth` for any non-public path. `/help` is not in the public list, so it is protected by default. Return-to-URL after login: pass the intended path to `/auth` if the login page already supports it; otherwise note as a gap (no auth change).
C. Roles: `useUserRole` (`role`, `canAccessOffice`). Used only to order/highlight guides, never to hide data. Engineer-only users see Engineer guides first; office/admin/owner see all.
D. Routes: `/help`, `/help/:guideSlug`, `/help/:guideSlug/:stepSlug` (e.g. `/help/engineer/complete-job`, `/help/office/team-users`). Standalone route like `/engineer/job/:id`, reachable from both shells.
E. Content: version-controlled TypeScript data (`src/help/guides/*.ts`) using the spec's Guide / Step / Screenshot model incl. `lastUpdated`, `keywords`, audience, mobile/desktop screenshot variants and numbered annotations. One generic renderer — new guides need no new page code.
F. Screenshots: see open question below.
G. Migration: none.
H. Security: no tenant data read; help content is static and identical for every tenant.

## What gets built
1. Help home: search box + category tiles (Engineer App, Office App, Customers, Scheduling, Team & Users, Quotes & Payments, WhatsApp, Fault Finder); unwritten categories shown as "coming soon".
2. Guide page: step list, "Last updated DD/MM/YY".
3. Step page: short steps, large tap-to-enlarge screenshot, numbered callouts listed as text above the image (mobile), prev/next step, back to guide.
4. Client-side search over guide/step titles, descriptions and keywords.
5. V1 content: Engineer App Guide and Team & Users Guide, text taken verbatim from the spec.
6. Entry points: "Help" item in the engineer header overflow menu and the office user menu (no bottom-nav change — 5-item limit).
7. Deep-link-ready slugs for future "Take a Tour" / Fault Finder links (not wired yet).

## Open issue — screenshots
No screenshots were attached. The normal asset store is a public CDN, which conflicts with "do not expose screenshots publicly". Proposal: V1 ships with placeholders; when you supply screenshots, they must contain only test-tenant (Cavan / scratch) data, or be stored in a private storage bucket with signed URLs (that would need a small storage change — separate approval).

## Technical details
- New files: `src/help/types.ts`, `src/help/guides/engineer.ts`, `src/help/guides/teamUsers.ts`, `src/help/search.ts`, `src/pages/help/HelpHome.tsx`, `HelpGuide.tsx`, `HelpStep.tsx`, `src/components/help/ScreenshotViewer.tsx`, `CalloutList.tsx`.
- Changed: `src/App.tsx` (3 routes, lazy-loaded), engineer header overflow menu, office user menu (one link each).
- Tests: unit tests for search ranking and slug lookup (unknown slug -> not-found state); Playwright check signed-out `/help` redirects to `/auth`, signed-in renders at 390px and 1280px.
- Completion report per spec section 22.
