# BJ-NEW-M step 1 — Scanner-safe Set Password page (frontend only)

Scope: `src/pages/ResetPassword.tsx` only. No changes to Auth.tsx, Edge Functions, routing, styling, or password rules. iOS Chrome handling kept.

## Changes

1. **Add URL type helper**
   - `getLinkType()` reads `type` from query/hash. Returns `"invite"`, `"recovery"`, `null` (missing → treated as recovery), or `"invalid"` for anything else.
   - `hasRecoveryIntent()` returns true for `type=recovery` or `type=invite`.

2. **useEffect (`establish()`)**
   - Replace Method 1 and Method 2 with: if `token` or `token_hash` is in the URL, `setShowForm(true)` and `return` — no `verifyOtp`, no 5-second timeout, no URL stripping (token is needed at submit).
   - Method 3 (access_token + refresh_token), Method 4 (existing session) and the `onAuthStateChange` fallback + timeout left byte-identical.

3. **`establishSessionIfNeeded()` (submit only)**
   - Resolve type: missing → `"recovery"`; `"invite"`/`"recovery"` passed through to `verifyOtp` for both `token + email` and `token_hash` paths; any other type → return false, which shows the existing "Session expired" toast.
   - On successful verification, strip the token from the URL.
   - Access/refresh-token path unchanged.

4. **Invite copy** (when `type=invite`)
   - Title "Set up your account"; description "Choose a password to finish setting up your account."; button "Create password" (loading text unchanged). Reset links keep existing copy.

5. **Audit metadata**
   - `triggered_by: "invite"` when `type=invite`, otherwise `"self"`, in both `logAudit` and `logAuthActivity` (logAuthActivity currently has no metadata field; `triggered_by` added only where its signature allows — will confirm against `src/lib/authActivity.ts` and leave it untouched if it doesn't accept metadata, reporting that).

## Verification / report

- Full diff; `rg -n verifyOtp src/pages/ResetPassword.tsx` showing no call inside the useEffect.
- Tests + typecheck.
- Test 1 (Cavan Gas test user only): request reset, open link, wait 10s, confirm no "expired" error, set password, log in. Screenshots.
- Test 2: resubmit same link → "Session expired".
- Commit hash, and the actual branch (previous sessions ran on an edit branch rather than `dev` — will report truthfully).

## Risk notes

- This only protects links that land on `/reset-password?token_hash=...`. If the reset email template links via the auth `/verify` endpoint (which redirects with `access_token` in the hash), a scanner can still consume it before the page loads; I will check what the current reset email link looks like during Test 1 and report it.
- Auth flow change — per project rules this is outside "lite review"; treat as Heavy TDD: add a unit test for the type-resolution helper (invite / recovery / missing / invalid).
