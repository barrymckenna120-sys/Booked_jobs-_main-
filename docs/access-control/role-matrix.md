# Access control: role / can_access_office matrix

Reference for how office vs engineer access is decided. Rules below reflect the
code as implemented — keep this file in step with those four files.

## Where the decisions live

| File | Responsibility |
| --- | --- |
| `src/hooks/useUserRole.ts` | Resolves the effective role + `canAccessOffice` for the signed-in user. Single source of truth. |
| `src/lib/resolveLandingPath.ts` | Post-login landing path (used by `Auth.tsx` and `RootRoute`). |
| `src/components/layout/AppLayout.tsx` | Shell-level bounce: restricted engineers cannot sit inside the office shell. |
| `src/components/shared/OfficeRoute.tsx` | Per-route gate for office-only screens (Finance, Settings, Products, …). |

Do not re-implement this logic elsewhere.

## Matrix

| Identity | Office access | Post-login landing |
| --- | --- | --- |
| `profiles.role = 'superadmin'` | Yes (short-circuits before the engineers lookup) | `/dashboard` |
| `engineers.role` in `owner`, `manager`, `admin`, `office` | Yes — always, `can_access_office` is ignored | `/dashboard` |
| `engineers.role = 'engineer'` with `can_access_office = true` | Yes | `/dashboard` |
| `engineers.role = 'engineer'` with `can_access_office` false/null | No | `/engineer/today` |
| Signed-in user with no `engineers` row | No — falls back to role `engineer`, no office access | `/engineer/today` |
| Role lookup errors or times out | No — same least-privileged fallback as "no row" | `/engineer/today` |

The engineer row is matched on `engineers.auth_user_id`; profile lookups use
`profiles.user_id` (not `profiles.id`).

## Tenant behaviour

The rules are identical for every tenant — there is no per-organisation
override anywhere in this logic. What differs between K&N, Dublin Gas and Cavan
Gas is only the data: which `role` and `can_access_office` values each org has
set on its own engineer rows.

## Restricted-engineer redirects

A restricted engineer who reaches an office-only route is sent directly to
`/engineer/today` (with the "Access restricted to office users." toast).
`AppLayout` applies the same bounce at shell level. Previously `OfficeRoute`
redirected to `/dashboard`, which then re-redirected — that double hop was
removed.

## Engineer app

Restricted engineers use their own shell (`EngineerLayout`): Today, Upcoming,
Completed, Parts, plus job detail and certificates. Users with office access can
move between the two shells.
