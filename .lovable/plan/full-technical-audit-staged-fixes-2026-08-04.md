# Full technical audit + staged fixes

I scanned the project structure, `package.json`, `vite.config.ts`, `index.html`, `public/manifest.json`, the router in `src/App.tsx`, both service-worker registration paths, `useAuth`, and `useNetworkStatus`. TypeScript currently compiles clean (`tsgo --noEmit` produced no errors), so the real problems are in PWA wiring, first-load performance, and mobile/iOS behaviour.

Below are the confirmed findings (each verified by reading the file), then the staged fix plan. Nothing is changed yet.

## Confirmed issues

### 1. Published app never gets a service worker — Critical
`src/main.tsx` (~line 40) and `src/components/pwa/PWAUpdateBanner.tsx` (~line 28) both treat any host containing `lovable.app` as a Lovable preview. The live app is served from `karlsgas.lovable.app`, so on the real published site the code takes the "preview" branch: it unregisters every service worker and never registers the Firebase messaging worker. Effect: no offline support, no update banner, and background push registration is skipped for the majority of users. Fix: match preview hosts precisely (`id-preview--`/`preview--` prefixes, `lovableproject.com`, `lovableproject-dev.com`, `beta.lovable.dev`) and stop treating plain `*.lovable.app` as preview.

### 2. App-shell SW registers inside Lovable preview anyway — High
`PWAUpdateBanner.tsx` computes `shouldRegister` but calls `useRegisterSW()` unconditionally and only uses the flag to decide whether to render the banner. Hooks cannot be conditional, so the registration still happens in preview iframes — the exact stale-shell situation the guard was written to prevent. Fix: move registration into a child component that is only mounted when `shouldRegister` is true, and unregister `/sw.js` when it is false.

### 3. Constant network polling on every page — High
`src/hooks/useNetworkStatus.ts` polls the backend REST root every 3s indefinitely, and every 1s (up to 60 attempts) once a probe fails. It is mounted on the signed-out marketing home via `MarketingOfflineGate` and inside `useEngineerJobs`. On mobile this is a measurable battery/data drain, and a single failed probe redirects marketing visitors to `/offline`. Fix: drive state from `online`/`offline` events plus a visibility-change probe, only poll while offline, back off exponentially, and require two consecutive failures before declaring offline.

### 4. Zero code splitting — High (first-visit performance)
`src/App.tsx` eagerly imports all 58 pages, including heavy admin, finance, chart (`recharts`), spreadsheet (`xlsx-js-style`) and PDF screens. A first-time visitor on mobile downloads the entire app to read the landing page. Fix: keep `Index`, `Auth`, `NotFound`, `Offline` eager; convert the rest to `React.lazy` with a single `Suspense` fallback. Also add a manual chunk split for `recharts` and `xlsx-js-style`.

### 5. Global auth gate blocks public routes — Medium
`AppContent` calls `useAuth()` with the default `redirectTo="/auth"` at the router root, so every public document/quote/receipt route depends on the shared public-prefix allowlist in `useAuth.tsx`, and a full-screen white loader covers the landing page during session restore. Fix: call `useAuth("")` in `AppContent` (redirects already happen per protected layout) and render nothing/inline skeleton instead of a blocking full-screen state on public paths.

### 6. iOS standalone safe areas missing — Medium
`index.html` viewport has no `viewport-fit=cover`, and there is no `env(safe-area-inset-*)` usage anywhere in `src/index.css`. In an installed iOS PWA the fixed bottom navigation sits under the home indicator. Fix: add `viewport-fit=cover`, safe-area padding utilities, and apply them to the bottom nav and fixed headers.

### 7. Manifest gaps — Medium
`public/manifest.json` has no `id`, `scope`, `orientation`, no `purpose: "maskable"` icon, and no `screenshots`. Android shows a letterboxed adaptive icon and richer install UI is skipped. Description still says "Karl's Gas" while the app is branded BookedJobs. Fix: add `id`, `scope: "/"`, `orientation: "portrait"`, a maskable icon entry, and correct the description.

### 8. Type safety and dead imports — Low
`tsconfig.json` disables `strictNullChecks`, `noImplicitAny`, `noUnusedLocals`. `App.tsx` imports pages that are no longer routed (`Renewals`, `Messages`, `SalesLedger`, `QuotesList`, `Finance`, `CertificateViewer`, `IncomingJobs`). Fix: remove the dead imports now; leave compiler-strictness changes as a separate, deliberate migration rather than flipping them in an audit pass.

### 9. `100vh` loaders on iOS Safari — Low
The loading screens in `App.tsx` use inline `height: "100vh"`, which overflows behind Safari's dynamic toolbars. Fix: use `100dvh` with a `100vh` fallback.

## Staged plan

Stage A — PWA correctness (issues 1, 2, 7): fix the preview-host detection in both files, restructure `PWAUpdateBanner` so registration is genuinely conditional, and complete the manifest. This is the highest-value, lowest-risk block.

Stage B — network + auth behaviour (issues 3, 5): rewrite `useNetworkStatus` to be event-driven with backoff, and stop the root-level auth redirect from gating public routes.

Stage C — performance (issue 4): lazy-load routes and split vendor chunks; report before/after build output.

Stage D — mobile/iOS polish and cleanup (issues 6, 8, 9): safe-area handling, `dvh` loaders, dead-import removal.

After each stage: typecheck, production build, and a Playwright pass over first visit, login, a nested-route refresh, and the landing page at 390x844 and landscape. Final deliverable: prioritised issue list, fixes made, remaining risks, a mobile/PWA test checklist, and a release-readiness verdict.

## Not covered by code changes

Accessibility, contrast, and full journey testing (sign-up, session expiry, install prompt on real iOS/Android hardware) will be reported as findings with recommended fixes; some can only be finally confirmed on physical devices. No secrets are exposed in the client bundle — the Firebase web config, Sentry DSN, and the backend publishable key are all designed to be public; the only sensitive value in `.env` is absent from client code, which is correct.

## Technical notes

- Preview-host predicate will be extracted into one shared helper (`src/lib/isPreviewHost.ts`) so `main.tsx` and the PWA banner cannot drift apart again.
- Service-worker changes only take effect on the published domain; the Lovable preview will still deliberately have no app-shell worker.
- Lazy routes change chunk names, so any installed PWA will fetch a new precache manifest on next visit — expected, and the update banner will start working once Stage A lands.
