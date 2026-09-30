# BJ-NEW-AA (1 of 3): Public iPhone setup page

The only design source is `iphone-setup.html`. None of the other HTML uploads are used, copied or referenced.

## What engineers get
A page at `/help/iphone-setup` that opens without signing in. It is a straight copy of the approved design:
- Header: "BookedJobs · iPhone 14 and newer", the title, and "Follow the orange circles."
- Three chips: Safari only / Not Private mode / iPhone updated.
- The 8 phone mockups with their captions, in this order: Safari •••, Share, Add to Home Screen, Open as Web App + Add, new icon, Allow, Settings check, lock-screen alert. Each has pulsing orange tap circles and orange highlight outlines.
- A "Not working?" box with the 5 fixes, and a Checklist box with 4 ticks, the "0 of 4 done" / "All done" counter and the one-phone warning.
- Footer: "BookedJobs · iPhone setup · updated 30/09/26".
- A "Back to sign in" link at the top that goes to `/auth`.

All wording is copied exactly from the HTML. Nothing is redesigned.

## Routing and access
- `src/App.tsx`: add one lazy import and a top-level route `/help/iphone-setup`, placed before the `/help` HelpLayout block. The page is not wrapped in HelpLayout.
- `src/hooks/useAuth.tsx`: add `"/help/iphone-setup"` to `PUBLIC_PATH_PREFIXES`, with a comment that matches the route. `/help` and `/help/engineer` stay protected. The prefix check does not match `/help` itself.

## Web address on the mockups
- New `src/lib/setupGuideHost.ts`: `getSetupGuideHost(hostname = window.location.hostname)`. It returns the hostname when it ends in `.bookedjobs.ie`, otherwise `yourcompany.bookedjobs.ie`.
- It is used in all 4 places the HTML shows `kngasservices.bookedjobs.ie` (steps 1, 2, 3 and 4). No tenant name or domain is hard-coded, and nothing is looked up in the database.

## Technical details
- New `src/components/help/PhoneMockup.tsx`: the phone frame (bezel, island, status bar) plus a `TapMarker`, both built with Tailwind. The phone screens use fixed iOS light colours from the HTML because they must stay light in every theme. These colours are scoped to the mockup and are the only fixed colours. The orange accent `#e0561b` is scoped the same way, because it is part of the approved design.
- New `src/pages/help/IphoneSetup.tsx`: the page around the phones uses theme tokens (`bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`). The HTML's display and body fonts (Barlow Semi Condensed, Atkinson Hyperlegible) are applied to this page only, loaded through a Google Fonts `<link>` in the page.
- Pulse animation: a Tailwind keyframe applied with `motion-safe:` only, so it stops under prefers-reduced-motion.
- Each phone is `aria-hidden="true"`. The numbered steps are an `<ol>`, so screen readers read the captions.
- Checklist: `useState` only, no localStorage. The counter is `aria-live="polite"`.
- Layout is a mobile-first grid (`minmax(250px,1fr)`) with phones at `max-w-full`, `overflow-x-hidden`, and top padding that respects the safe area. No sideways scroll at 375–430px.
- `PageSeo` title "iPhone setup — BookedJobs", path `/help/iphone-setup`, following the PrivacyPolicy pattern.
- Not touched: Auth.tsx, HelpHome.tsx, registry.ts, InstallAppBanner, the service worker, any other page.

## Tests
- `src/lib/setupGuideHost.test.ts`: the 5 hostnames from the brief.
- `isPublicPath`: export it for testing (no behaviour change) and assert `/help/iphone-setup` true, `/help` false, `/help/engineer` false.

## Evidence returned
1. The files changed and the current revision hash. Lovable manages git internally, so I can report the project revision, but I cannot push to or confirm `origin/dev`. Please check the branch in GitHub.
2. Raw vitest output.
3. Signed-out Playwright check at 390px: `/help/iphone-setup` loads with no redirect to `/auth`, plus a screenshot and a check for sideways scroll.
4. Signed-out `/help` still redirects to `/auth`.

## Still open from the previous task (H, zero-invoice rule)
The rule is deployed, but its 5 live checks and the scratch-data cleanup on K&N TEST are not done yet. I'll finish them first, in the same turn, and report them separately.
