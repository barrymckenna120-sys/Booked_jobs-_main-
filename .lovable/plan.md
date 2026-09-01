# Investigation: does the app shell remount on every navigation?

Verdict: **the concern is real**, but for a narrower reason than the report implies. There are two keyed boundaries. The inner ones are correct and harmless. One outer boundary in `src/App.tsx` is keyed to the pathname and wraps the entire `<Routes>` tree, which includes both layouts — so the shell does remount on every URL change.

## 1. Where the `key` actually is

`src/App.tsx` (lines 226-227, 550-551) — the whole route tree is inside a pathname-keyed boundary:

```text
<Suspense>
  <ErrorBoundary key={location.pathname} name="app-shell" homePath="/">
    <Routes>
      <Route element={<AppLayout />}>        (line 241)
      <Route path="/engineer" element={<EngineerLayout />}>  (line 408)
    </Routes>
  </ErrorBoundary>
</Suspense>
```

`src/components/layout/AppLayout.tsx` (lines 277-279) and `src/components/engineer/EngineerLayout.tsx` (lines 176-178) each also key a boundary, but those wrap only `<Outlet />` — page content only, chrome excluded. Those are correct.

## 2. Is the chrome inside the outer keyed subtree?

Yes. `AppLayout` and `EngineerLayout` are route elements *inside* `<Routes>`, so they sit below the keyed boundary. `AppLayoutInner` (line 66) mounts `useUserRole` (line 69), `useNotifications("office")` (line 82), `useUnreadMessages` (line 83), and the `parts-nav-count` query (line 85). All of these are remounted on every navigation, along with the sidebar and bell.

Consequence confirmed in code: `roleLoading` resets to `true` on each remount, so the `!roleLoading && isEngineer` redirect guard re-evaluates on every page change.

## 3. Realtime notifications

`src/hooks/useNotifications.ts` opens the channel in a `useEffect` (line 392) with `supabase.removeChannel(channel)` in cleanup (line 548). The dependency is `user?.id`, which was deliberately narrowed to survive token refreshes — but a **remount** runs cleanup and re-subscribes regardless of deps. Since the hook lives below the outer keyed boundary, the subscription is torn down and rebuilt on every navigation.

## 4. Does `staleTime: 60s` protect the data fetches?

Partly. `src/App.tsx` lines 93-102 set `staleTime: 60_000`, `gcTime: 30min`, `refetchOnWindowFocus: false`. React Query caches by query key, not by component identity, so a remount inside the 60s window serves cached data without a network request. So Step 4 does absorb most of the refetch cost.

What `staleTime` does **not** absorb: component-tree teardown/rebuild (flicker), loading-state flashes from non-React-Query state such as `roleLoading`, the realtime channel churn in point 3, and any in-progress local UI state (open panels, partially typed fields in shell-level components).

## 5. Regression or pre-existing?

Introduced by the Step 3 change. The nested per-route boundaries in the two layouts are the intended Step 3 mechanism and are correctly scoped. The outer `key={location.pathname}` in `App.tsx` is the added-and-unnecessary part: its stated purpose (per the comment on lines 224-225) is to cover the standalone routes that render without a layout, which needs a boundary but does not need a pathname key across the whole tree.

## 6. Smallest fix

Remove `key={location.pathname}` from the outer `ErrorBoundary` in `src/App.tsx` only. Nothing else changes.

- The layouts already provide per-route error reset via their own keyed boundaries wrapping `<Outlet />`.
- The standalone routes (`/auth`, `/reset-password`, redirects) keep boundary protection; they lose only automatic reset-on-navigate, and each of those screens is a full navigation away from any crash anyway.
- If reset for standalone routes is wanted, it can be added later as its own narrow keyed boundary around just those routes, rather than the whole tree.

Change scope: one line in `src/App.tsx`, plus dropping the now-unused `location` reference if nothing else in `AppContent` uses it.

## Verification after the fix

- Navigate between office pages and confirm the sidebar/bell no longer flash and no repeated realtime subscribe logs appear.
- Confirm a crashing route still shows the fallback and still clears when navigating away (nested boundary path).
- No changes to payments, messaging, or any protected file.
