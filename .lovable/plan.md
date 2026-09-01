# Fix flash-of-restricted-content for engineers (one shared gate)

## 1. Why it happens

The flash is not inside `OfficeRoute` — it is in `AppLayout`, the shared parent of every office route.

- `src/components/layout/AppLayout.tsx:138` gates the redirect with `if (!roleLoading && isEngineer && !canAccessOffice) return <Navigate to="/engineer/today" />`. While `roleLoading` is still `true`, that condition is false, so the component falls through and renders the full shell **and `<Outlet />`** — the child page mounts, fetches and paints.
- `useUserRole` resolves asynchronously (two awaited queries: `profiles`, then `engineers`), so `roleLoading` is `true` for the first paints. Everything under `AppLayout` is visible during that window.

So it varies by page, contrary to first impression:

- **Unguarded office pages** (`/dashboard`, `/jobs`, `/jobs/:id`, `/pipeline`, `/customers`, `/customers/:id`, `/schedule`, `/inbox`, `/parts`, `/products`, `/quotes/*`) have no `OfficeRoute` at all. These render fully, then redirect — a genuine flash of restricted content.
- **`OfficeRoute`-guarded pages** (`/finance`, `/settings`, `/settings/import`, `/warranty`, `/insights`, `/message-log`, `/system-logs`, `/whatsapp*`, `/diagnostics/whatsapp`, `/debug/incoming-jobs`) already block their own children behind a spinner (`OfficeRoute` returns a loader while `authLoading || roleLoading`). What flashes there is the surrounding shell (sidebar, header, bells, banners), not the page body.

Secondary contributor: `AppLayout` and `OfficeRoute` each call `useUserRole` independently, so the role is resolved twice with independent `loading` timelines.

## 2. Correct best-practice fix

Block the render until the permission check resolves, at the single shared boundary — never render restricted UI and then navigate away. React Router "loader"-based permission checks are not available here: the app uses the declarative `<BrowserRouter>` + `<Routes>` API, not a data router (`createBrowserRouter`), so there are no route loaders to hook into. Migrating to a data router would be exactly the broad refactor to avoid. The idiomatic equivalent for this setup is a guard component that renders nothing but a loading state until the check resolves.

## 3. Same category as the earlier fixes?

Structurally different. The shell-remount and token-refresh bugs were **re-render / dependency-identity** problems (unstable `key`, unstable `user` object). This is a **render-ordering / async-gate** problem: correct data, rendered too early. It is adjacent only in that both surface through `useUserRole` timing.

## 4. Smallest safe fix (one place, covers every route)

Single change in `src/components/layout/AppLayout.tsx`:

1. Before any shell markup and before `<Outlet />` renders, add an early return while the check is pending:
   - if `authLoading || roleLoading` → render the same centred `Loader2` spinner pattern already used by `OfficeRoute` (keeps visuals consistent, no new component).
2. Keep the existing restricted redirect immediately after it, unchanged, and add `replace` so the blocked URL does not stay in history.

That is the whole fix. Because `AppLayout` is the parent route element for all office pages, no guarded page renders — body or shell — until the role is known, so every route (guarded and unguarded) benefits at once. `OfficeRoute` stays exactly as-is; it remains the correct per-route authorisation gate for office-only pages and no longer has anything to flash around it.

Not in scope (noted, not proposed): de-duplicating the two `useUserRole` calls into a shared context, and adding `OfficeRoute` to currently unguarded office pages. Both are separate decisions.

### Verification

- Typecheck.
- Playwright as a restricted engineer: navigate directly to `/dashboard`, `/finance`, `/settings`, `/products`; assert the first painted frame contains no page content (screenshot immediately after `domcontentloaded`) and the final URL is `/engineer/today`.
- Regression: office/admin user loads `/dashboard` and `/finance` normally, one spinner then content, no console errors.
