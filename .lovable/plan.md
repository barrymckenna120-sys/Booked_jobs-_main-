This was a read-only audit request. Findings are in the chat response above; no code changes are proposed.

**Summary of findings**

- Route: `/schedule` → `src/pages/Schedule.tsx` (single component, both viewports). Declared at `src/App.tsx:143` inside the `<AppLayout />` route.
- Desktop "Full Schedule" (`src/components/dashboard/TodayTimeline.tsx:68`) uses a plain `<a href="/schedule">` — full page reload.
- Desktop header "Schedule" button (`src/pages/Dashboard.tsx:168`) and `WeekSnapshot` (`src/components/dashboard/WeekSnapshot.tsx:97`) use `navigate("/schedule")` — soft nav.
- Mobile bottom nav (`src/components/layout/AppLayout.tsx:53-59`, `MOBILE_NAV`) does NOT include `/schedule`. The `CalendarDays → /schedule` item lives only in `DESKTOP_NAV` (line 41). Mobile users reach Schedule via the Dashboard header button.
- Guards before Schedule renders (all viewport-agnostic, no `useIsMobile`, no feature flag):
  1. `useAuth` loading gate — `src/App.tsx` `AppContent`
  2. `RecoveryRedirectGuard` — `src/App.tsx:83-107`
  3. `AppLayoutInner` engineer redirect: `isEngineer && !canAccessOffice → /engineer/today` — `src/components/layout/AppLayout.tsx:123-125`
  4. `useOrgId()` `ready` gate inside `Schedule.tsx:115`
- No `<OfficeRoute>` wrapper on `/schedule` (contrast lines 138-146 in `App.tsx`).
- Notable: only the `TodayTimeline` `<a href>` path forces a cold-start auth/role bootstrap; the other entry points do not. Relevant if the "bounces to homepage" symptom is reproducible only from that button.

**Next step**

Awaiting user direction on which (if any) of the above to act on. No plan to implement yet.