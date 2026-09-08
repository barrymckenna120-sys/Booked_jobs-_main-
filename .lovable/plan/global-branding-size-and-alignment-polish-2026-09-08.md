# Global branding size and alignment polish

## Goal
Make the BookedJobs branding consistently prominent and balanced across Office, Engineer, Admin, authentication, recovery, offline, install, and public-header surfaces without changing any workflow or layout structure.

## Implementation
1. **Standardize the shared logo treatment**
   - Extend `AppLogo` with explicit semantic size/presentation options rather than page-specific dimensions.
   - Use a 40–44px visual container on desktop with an approximately 28–32px visible mark, and a smaller mobile treatment with an approximately 24–28px visible mark.
   - Preserve each asset’s intrinsic proportions with `object-contain`; never crop, stretch, or blur it.
   - Centralize the mark/wordmark source, spacing, alignment, and breakpoint behavior in this component.

2. **Apply it consistently to the three workspace shells**
   - Office, Engineer, and Admin desktop sidebars will use the same logo size, container, and workspace-label alignment.
   - Mobile Office, Engineer, and Admin headers will use the shared compact size while retaining current header height, safe-area behavior, actions, and navigation-icon sizes.
   - Admin’s mobile drawer and desktop sidebar will share the same branding spacing as the other workspaces.

3. **Remove remaining one-off branding sizes**
   - Replace direct BookedJobs image usage on sign-in, password reset, offline, install prompt, and public/sticky headers with the appropriate shared-logo option where that preserves the existing surface.
   - Keep deliberately larger centered identity treatments, such as auth/offline cards, proportionate to their existing role rather than forcing shell dimensions onto them.
   - Do not alter copy, controls, routing, permissions, or surrounding layout structure.

## Verification
- Visually check Office, Engineer, and Admin at 320, 375, 430, 768, 1024, 1440, and 1920px.
- Check sign-in, reset-password, offline/install, and public-header branding for crisp rendering and proportional scaling.
- Confirm no header overflow, clipping, crowding, alignment shifts, enlarged navigation icons, or mobile safe-area regressions.
- Run TypeScript checks, the existing Vitest suite, a focused browser console check, and `git diff --check`.

## Risk assessment
- **Risk level:** Low, presentation-only.
- **Shared impact:** `AppLogo` is used by all three workspace shells, so responsive verification is required before shipping.
- **Tests:** No new unit test is warranted for pure visual sizing; existing automated checks plus responsive visual verification cover the change.
