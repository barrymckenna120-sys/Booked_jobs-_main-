# Restricted-engineer flash: remaining causes

## What the console log actually shows

Three separate things, only one of which is a real bug.

1. **`useUserRole data: null` repeated** — verified cause: the role hook is not shared. `useUserRole` is called independently in `AppLayout`, `OfficeRoute`, `EngineerLayout`, `Dashboard` and ~20 pages. Every instance keeps its own state and runs its own lookup, starting from `loading = true` / no data. So each mount logs another `null`, and each one re-queries the database. There is no shared cache today.

2. **Engineer job queries running "before the role resolves"** — verified: those queries come from `useEngineerJobs`, which lives in `EngineerLayout` (the `/engineer/*` tree), and is gated on the session only, not on role. That is correct for the engineer app — it is the destination, not a restricted office page, and it sits outside `AppLayout` entirely. It fires as soon as the redirect lands, and because each layout re-resolves role from scratch (point 1), its `null` role log interleaves and looks like data arriving "first". Not a flash source, but the interleaving is a symptom of the same missing shared role state.

3. **The two 401s on `/rest/v1/`** — not the Parts badge (that one is guarded and the path had a table name). These are to the bare `/rest/v1/` root with no key, from the deliberate connectivity probe in `EngineerLayout` ("any HTTP response proves reachability — even 401 means we're online"). Expected by design, pure log noise. To be confirmed in the live check before we call it settled.

## Fix

**A. One shared role resolution.** Convert `useUserRole` internals to a single cached query (react-query, keyed on user id, with a stale time) so:
- the lookup runs once per session, not once per component;
- every later consumer reads the already-resolved value with no `loading` window, so no component can paint before the permission answer exists;
- the `null` log spam and duplicate database reads disappear.

Public shape of the hook stays identical (`role`, `isEngineer`, `canAccessOffice`, `engineerId`, `engineerName`, `loading`), so no call site changes and no guard logic changes. The existing timeout/fallback behaviour (fall back to least-privileged `engineer` if the lookup fails or hangs) is preserved.

**B. Quieten the connectivity probe.** Point it at a request that does not 401 (or send the public key), keeping the same "any response = online" semantics. Cosmetic only.

**C. Verify for real.** Sign in as `abdenneur1+cavantest@gmail.com` in the browser, hard-load `/dashboard`, `/finance`, `/settings`, `/products` and record: no restricted content painted at any frame, single role lookup, no `null` spam, no 401s. Then re-check one office account to prove no regression.

## Not doing

- No change to `OfficeRoute`, `AppLayout`'s gate, or the redirect targets — those are correct.
- No change to `useEngineerJobs` fetching or the engineer app's data flow.
- No per-page patches.

## Technical notes

- `src/hooks/useUserRole.ts` — replace local `useState`/`useEffect` with `useQuery` (`["user-role", userId]`, `staleTime` long, no refetch on focus), keeping the superadmin short-circuit, the engineers lookup, and `withRequestTimeout`.
- `src/components/engineer/EngineerLayout.tsx` — connectivity probe target/headers only.
- Verification: typecheck plus a Playwright run per route with the real Cavan engineer session.
