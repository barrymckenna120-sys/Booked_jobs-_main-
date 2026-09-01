# Fix engineer redirect hop + document the access matrix

Two small, low-risk changes to the existing role gating. No change to who can access what — only where restricted engineers land, and written documentation of the rules that already exist.

## 1. Send restricted engineers straight to the Engineer app

Today, an engineer without office access who opens an office-only page (Finance, Settings, Products, etc.) is sent to the Dashboard, which then immediately sends them on to the Engineer Today screen. Two redirects, one "Access restricted" toast, and a brief flash of the wrong screen.

Change: the office guard sends them directly to the Engineer Today screen. Same access rules, same toast, one hop.

Who is affected: only users with role `engineer` and office access turned off. Everyone else (owner, manager, admin, office, superadmin, and engineers with office access explicitly enabled) is untouched.

## 2. Document the access matrix

Add a short reference doc capturing the rules as they are implemented, so the next person doesn't have to trace three files:

- Which roles always get office access regardless of flags
- How the office-access flag interacts with the engineer role
- How superadmin is resolved separately
- What happens to a signed-in user with no team-member record
- That the rules are identical for every tenant — only the per-tenant data differs
- Where each decision physically lives, and the rule that this logic stays in one place

## Technical detail

- `src/components/shared/OfficeRoute.tsx`: change the redirect target from `/dashboard` to `/engineer/today`. Guard condition (`role === "engineer" && !canAccessOffice`) stays byte-identical.
- `docs/access-control/role-matrix.md` (new): documents `useUserRole.ts` (role + `can_access_office` resolution, superadmin short-circuit, engineer fallback), `resolveLandingPath.ts` (post-login landing), `AppLayout.tsx` (shell-level bounce), and `OfficeRoute.tsx` (per-route gate). Documentation only — no behaviour asserted that isn't in the code.
- The redundant `isEngineer` value destructured but unused in `src/pages/Dashboard.tsx` is left alone; removing it is unrelated cleanup.

## Verification

- Typecheck passes.
- Office roles: office-only routes still render, no redirect.
- Restricted engineer: office-only route lands on Engineer Today in a single navigation, toast still shown, no Dashboard flash.
- Engineer with office access enabled: still reaches office routes normally.
