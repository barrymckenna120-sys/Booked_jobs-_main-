# Fix: tour type follows the app you're in, not your role

## Confirmed cause
`useOnboardingTour` sets `tourType = role === "engineer" ? "engineer" : "office"`. Both `AppLayout` and `EngineerLayout` call `useOnboardingTour(user)` and pass that `tourType` to the tour, so an admin/owner/office/superadmin in the engineer app gets the office tour. Feedback already takes `tour_type` from the `tourType` prop, so it is wrong in the same case.

## Changes (3 files)
1. `src/hooks/useOnboardingTour.ts`
   - Signature becomes `useOnboardingTour(user, layout: TourType)`. `tourType = layout`.
   - Remove the `useUserRole` import and the role check. The loading effect no longer waits for role loading (it only needed that for the role); the `user` dependency stays.
   - Nothing else changes: the same localStorage key and `profiles.onboarding_complete` flag (one per user), auto-show when it isn't set, `startTour` sets replay mode, and a replay never writes.
2. `src/components/layout/AppLayout.tsx`: `useOnboardingTour(user, "office")`.
3. `src/components/engineer/EngineerLayout.tsx`: `useOnboardingTour(user, "engineer")`.

"Take the tour" in each app already calls that app's `startTour`, so it now opens that app's tour. Feedback `tour_type` follows automatically, with no feedback code changes.

## Tests
- Add a small unit test that the hook's source no longer references the role for the tour type (the test setup has no DOM). Run tsgo and the build.
- Browser, signed in as the Test Gas 4 admin:
  - (a) engineer app → Take the tour → 6 engineer steps, at 390px and 1024px.
  - (b) office app → Take the tour → 7 office steps.
- (c) needs an engineer-role user in Test Gas 4, and none exists (only the admin). Adding one is a data change, so it's a separate step that needs your approval. I'll show the exact SQL/invite (scratch email, Test Gas 4 org, `engineer` role) before running it, then read back profile, role and org to check they match. If you don't approve, (c) stays unverified.
- Read back one replay feedback row from the engineer app to confirm `tour_type='engineer'` and `is_replay=true`.

## Not changed
Tour content, the mobile sheet, the desktop dialog, the feedback form logic, and the database. Nothing is published. It gets committed to dev if the branch allows; otherwise I'll report the working-branch hash.
