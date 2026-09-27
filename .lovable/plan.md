# Read-only diagnosis: barrytest2024+2@gmail.com (no changes made)

## 1. auth.users
- id: 37eed0e6-a0b9-4eb8-9d32-5a8be0d340dd
- created_at: 2026-09-27 08:42:47.291 UTC
- invited_at: 2026-09-27 08:42:47.289 UTC
- email_confirmed_at: 2026-09-27 08:43:46.546 UTC
- last_sign_in_at: 2026-09-27 08:43:46.550 UTC
- updated_at: 2026-09-27 08:43:46.996 UTC
- banned_until: null
- encrypted_password set: true

## 2. profiles / engineers
- profiles: organisation_id a7cfa53b-b4cb-4291-a283-69bbb8aa4fc1, role admin, is_active true, deactivated_at null
- engineers: organisation_id a7cfa53b-b4cb-4291-a283-69bbb8aa4fc1, role admin, status active (the table has no is_active column)

## 3. organisations (a7cfa53b-...)
- name: "test gas 3", public_domain: null, subscription_status: trial

## 4. Failed-login / lock state
- login_attempts (used by track-failed-login): 0 rows for this email → attempt count 0, locked: no
- profiles has no lock columns; lock-failed-login reads profiles/organisations only
- Auth log: one `/token` 400 invalid_credentials at 08:45:00 (password sign-in failed)

## 5. audit_log + auth_activity_events (last 2h)
- audit_log: 0 rows. **No `password_reset_completed` row.**
- auth_activity_events: 0 rows
- Auth logs sequence: 08:42:47 generate_link (invite) → 08:43:46 /verify 200 (user_signedup, login via otp) → 08:43:47 PUT /user 200 (user_modified, password set) → 08:43:47 /logout 204 → 08:45:00 password login 400 invalid credentials → 08:48:38 and 08:48:45 /verify 403 otp_expired ("One-time token not found")

## 6. Edge Function logs
- provision-tenant: only boot/shutdown lines at 08:42:46–08:46:06; no log line records step 7a / invite_sent (the function does not log it). The invite email was generated via generate_link at 08:42:47.
- send-reset-email 08:45:28: "Password reset requested for: barrytest2024+2@gmail.com" followed by warning **"no tenant domain resolved — send skipped"** (org public_domain is null).

## 7. Published site version
- Yes, karlsgas.lovable.app serves ResetPassword-BoILy9ow.js which contains "This link is for a different account" (the account-match guard).
- How checked: fetched the published index.html → main bundle → lazy ResetPassword chunk, grepped the string.
- ResetPassword.tsx is byte-identical in 9910ea4f7, e1a94511a and HEAD (git diff empty), so the published chunk matches e1a9451's version of this file. Caveat: this is string-based inference, not a build hash match.

## Unexplained / notable facts
- Password update at 08:43:47 succeeded, but no audit/auth-activity row was written.
- Reset email for this tenant was skipped due to null public_domain.
