# Fix: blocked/locked user status and unblock feedback in Super Admin

## What I verified first

- Lockout state lives in **one** place: the auth-side ban (`banned_until`), set for 1 hour by the `lock-failed-login` function after 5 failed attempts. Lockouts have genuinely fired (5 lockout alerts recorded, one expired ban still visible on an account). No user is banned right now, and there is no second custom counter table driving login (`login_attempts` is not consulted by the sign-in path).
- The **Unblock** action Super Admin uses (`reset-auth-block`) does clear the ban and resets a matching engineer row. It works server-side.
- The Super Admin **cross-tenant user table** ("User Activity — Overview") requests users with `scope: "all_orgs"`. That branch of the users function builds each row **without any blocked flag**, even though the function already computes blocked state for the other branches. So no lock status can appear beside a username there.
- Blocked status is only rendered inside the small "Unblock User" popover on the Unblock Users tab. After a successful unblock, that popover's user list is **never refetched** — only the tenant-level button style refreshes — so the user still shows "Blocked" and the action looks like it did nothing.

## Root cause

Two display/refresh gaps, not an auth or tenant-isolation fault:

1. The cross-tenant user list omits blocked state entirely, so Super Admin shows no Blocked/Locked status beside any username.
2. After Unblock succeeds, the user list showing the status is not re-read, so the stale "Blocked" row makes it look like access was not restored. Compounding this, bans auto-expire after 1 hour, so by the time an admin looks the state may already have cleared with nothing ever shown.

## The fix (3 files)

1. `supabase/functions/list-users/index.ts` — in the `all_orgs` branch, include `blocked` and `banned_until` on each row, reusing the blocked map the function already builds (plus the existing engineer-status merge). No auth, permission, or tenant-scoping changes.
2. `src/components/admin/UserActivityOverview.tsx` — add a **Status** column: a red "Blocked" badge (with the unlock time) or a neutral "Active" badge, and highlight blocked rows. Tenant filter, sorting and existing columns unchanged.
3. `src/pages/AdminPanel.tsx` — after `reset-auth-block` succeeds, refetch the org user list behind the Unblock popover (a refresh counter fed into the popover's existing load effect) so the row flips to Active immediately, and keep the existing success toast.

Nothing else changes: login flow, the lockout rule, `lock-failed-login`, `reset-auth-block`, `unblock-user`, RLS and tenant scoping all stay as they are.

## Verification

- Confirm the blocked flag is returned for both tenants and that each user's tenant mapping stays correct.
- Confirm a blocked user renders as Blocked in the overview, and unaffected users in the same tenant and in the other tenant render as Active.
- Click Unblock and confirm the row flips to Active without a page reload, the ban is cleared in the database, and sign-in with the correct password succeeds.
- Run the existing test suite (auth/lockout helpers included).

One constraint on live verification: triggering a real lockout bans a real account for an hour and fires admin lockout alerts. I will reproduce end to end using a single scratch/test login only, and check the other tenant's users read-only rather than locking anyone real.
