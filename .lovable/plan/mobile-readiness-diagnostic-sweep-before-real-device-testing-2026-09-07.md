# Mobile readiness — diagnostic sweep before real-device testing

Investigation only. Evidence below, then one proposed fix.

## 1. Steps 1 and 3 in production — CONFIRMED LIVE

Checked the actual published bundle (`https://karlsgas.lovable.app/assets/index-AYSpK37N.js`), not just the commit:

- Session-restore timeout: the published code contains the `"[Auth] initial session check failed"` catch branch, matching `src/hooks/useAuth.tsx:144-149` where `getSession()` is wrapped in `withRequestTimeout` and falls through to the signed-out path on timeout. Live.
- Connectivity banner: both banner strings are in the published bundle — the office default and the engineer wording `"No signal — changes won't save until you're back online"`. Mounted at `src/components/layout/AppLayout.tsx:162` (office) and `src/components/engineer/EngineerLayout.tsx:141` (engineer). Live in both views.

## 2. Deferred items — all still open, none worse

- Item 1B, engineer fetches unbounded: every read in `src/hooks/useEngineerJobs.ts` is still bare (`:129`, `:148`, `:178`, `:82`, `:95`) with no `withRequestTimeout`, and the failure path still retries unconditionally every 5s with no cap or backoff (`:246`). Accurate as described.
- Item 4, unthrottled resume refetch: `src/hooks/useEngineerJobs.ts:822-826` still calls the full `fetchAll()` on every `visibilitychange` to visible, plus again on `online`, with no throttle. Accurate.
- Item 5, no iOS PWA update check on resume: `src/components/pwa/PWAUpdateBanner.tsx:23` still calls `useRegisterSW` with no `onRegisteredSW` and no periodic `registration.update()`. Accurate.
- Item 2, raw `100vh`: still exactly the previously listed spots — `src/App.tsx:194`, `src/components/engineer/EngineerLayout.tsx:63`, `src/pages/QuoteAcceptance.tsx:191`, `src/components/messages/DirectMessageThread.tsx:135`, `src/components/engineer/ExtraWorkSheet.tsx:204`, `public/offline.html:16` (plus the intentional fallback pair in `src/index.css:200-204`). List accurate, cosmetic.

## 3. New findings from the Steps 1/3 pass

**New finding A — office connectivity banner breaks the desktop/tablet layout when offline (visual, medium).**
`AppLayout` renders the banner as a direct child of `div.min-h-screen.flex.flex-col.md:flex-row` (`src/components/layout/AppLayout.tsx:161-163`), so from `md` up the banner becomes a *row* flex item sitting beside `<main class="flex-1">` (`:313`). Reproduced in a browser with the same markup: at 390px the banner measures 390x48 at the top (correct); at 1280px it measures 1060x900 — a full-height column that squeezes the page content sideways. Engineer view is unaffected (it is not inside a row flex container). Only visible while genuinely offline, which is exactly the state the device test will produce.

**New finding B — banner overlap when offline and WhatsApp is erroring (cosmetic, low).**
`WhatsAppConnectionBanner` is `fixed top-0 ... z-[9998]` (`src/components/whatsapp/WhatsAppConnectionBanner.tsx:10`) while the connectivity banner is in normal flow at the top. If both fire they overlap rather than stack. No conflict with the sign-in timeout fallback: the timeout path just resolves to signed-out and routes to `/auth`, and the banner is only mounted inside the app layouts, so no double-banner there.

**Error logs:** the only client console output since publish is routine `[useNotifications] fetch` info lines (8 rows, 6 unread) — no errors, no new exceptions.

## 4. Go / no-go

Go, with one small fix first. Nothing functional is blocking: the stuck-loader path is bounded and the offline detector is live in both apps. Finding A is worth fixing before you test, because it makes the offline state look broken on tablet/desktop and could confuse the results of the same test on an iPad. Deferred items 1B and 4 will still show up on real weak signal — that is expected and is exactly what Step 2 is for; the localStorage cache means a returning engineer sees stale data rather than a spinner.

## Proposed fix (awaiting approval)

Single-concern, presentation only, in `src/components/layout/AppLayout.tsx`: move the two banners out of the row flex container so they sit above it (wrap the layout in an outer column, or give the banner `fixed`/full-width placement consistent with the WhatsApp banner). No change to `ConnectionBanner`, `useNetworkStatus`, `useAuth`, or engineer layout. Verify at 390, 768, 1024 and 1280px with the network blocked that the banner is a full-width strip at the top and page content is unshifted, then run typecheck and the full test suite.

Optional, same pass if you want it: make the two banners stack instead of overlap (finding B).

Held as before: Step 2 (bound engineer fetches, cap the retry loop), Step 4 (resume throttle + iOS update check), Step 5 (`100vh` cleanup).
