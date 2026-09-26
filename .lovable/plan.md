# BJ-NEW-N — Remove broken "Reset Password" button from tenants table

## What and why

In `src/pages/AdminPanel.tsx` the tenants-table row actions contain a "Reset Password" button (lines 2289–2337). It:

- uses `window.prompt` to capture a new password,
- calls the `admin-set-password` Edge Function,
- hardcodes the target user ID `ed429061-7b76-4272-af4a-25249ee6d719` (Barry's superadmin account) — so it always resets the wrong account, never the tenant owner shown in the row.

Tenant-owner password resets are already handled correctly by `src/pages/admin/TenantDetail.tsx` (`handleSendReset`). Verified: this button is the **only** remaining `admin-set-password` caller in `src/` (grep confirmed; `TenantDetail.tsx` does not call it).

## Change (single concern, one file)

Delete lines 2289–2337 of `src/pages/AdminPanel.tsx` — the `<Button ...>Reset Password</Button>` block including its full `onClick` handler — and nothing else. No replacement, no new logic, no styling changes to neighbouring buttons ("Send Magic Link", block/unblock) remain untouched.

Explicitly not touched: `src/pages/admin/TenantDetail.tsx`, the "Send Magic Link" button, all Edge Functions (including `admin-set-password`, which stays live for legitimate callers), any other part of `AdminPanel.tsx`.

## Branch note

The session is on Lovable's edit branch `edit/edt-75973df6-...`, which merges into `dev`. No manual git branch switching will be performed.

## Verification

1. `rg -n "ed429061|admin-set-password" src/` — expect zero matches after deletion.
2. Typecheck + production build pass.
3. Existing test suite still green (no behavioural test covers this dead button; removal is deletion only).
4. Report back: full `git diff` of `AdminPanel.tsx`, grep output, branch name.

## Risk

None beyond the intended removal. The button was functionally harmful (wrong-account reset target); its deletion cannot regress anything that worked.
