# Server-truth login lockout in Auth.tsx

Branch: `edit/edt-1e46c393-5e97-4789-9193-d5531b7ae086` (current working/preview branch, not main).

## Goal
The "Account locked" message today comes purely from a React counter that resets on refresh. Make the real lock state (auth ban expiry) drive it, and derive the unlock time from the actual ban instead of a hardcoded "1 hour".

## What changes

### 1. New edge function `check-lockout-status`
- Accepts `{ email }`, service-role lookup of the auth user.
- Returns only: `{ email, locked: boolean, locked_until: string | null }`.
- Unknown email or no ban → `{ locked: false, locked_until: null }` (no existence leak, no other user data).
- Ban in the past → `locked: false`.
- `verify_jwt = false` (pre-auth call), CORS headers, input validated, rate-limit-friendly (no listUsers full scan — filter by email via admin list with a query, fall back to match on email).

### 2. `src/lib/authLockout.ts`
- Add `lockedUntilMessage(lockedUntil: string)` returning e.g. "Account locked. Too many failed attempts — try again in 42 minutes (or reset your password)." Time derived from `locked_until`, using existing Europe/Dublin conventions for absolute display.
- Keep `LOCKOUT_MAX_ATTEMPTS`, `attemptsRemainingMessage`, `lockoutModalCopy` untouched for the "X attempts remaining" pre-lock path.

### 3. `src/pages/Auth.tsx`
- Before calling `signInWithPassword`, invoke `check-lockout-status`. If `locked`, show the derived message inline (and in the existing lock modal), and return without attempting sign-in.
- If not locked (or the check errors/times out), proceed exactly as today; Supabase's own response continues to drive the client counter.
- Client counter and its messaging stay in place; it is no longer the authority on "locked".

## Step 5 answer (report only, no fix)
`lock-failed-login` **is** wired into the login flow: `src/pages/Auth.tsx` invokes it (fire-and-forget) when the client counter reaches `LOCKOUT_MAX_ATTEMPTS`. Gap worth naming: because that counter is client-side and resets on refresh, an attacker can avoid ever triggering the ban by reloading between attempts — there is no server-side failed-attempt accounting (the `login_attempts` table is not consulted by this path). Not fixed here.

## Technical notes
- No schema changes, no RLS changes.
- Failure of the new check must never block a legitimate sign-in (fail-open on network/function errors).
