# Read-only diagnosis: barrytest2024+2@gmail.com — "Session expired" on Create password

No code or data changed.

## 1. Auth logs (08:30–09:00 UTC, from auth logs)
- 08:42:47 POST /admin/generate_link 200 — user_invited for barrytest2024+2@gmail.com (provision-tenant step 6)
- 08:43:46 POST /verify 200 — user_signedup, login via otp (the invite token was consumed here, ~1 minute after issue)
- 08:43:47 PUT /user 200 — user_modified (password set)
- 08:43:47 POST /logout 204
- 08:45:00 POST /token 400 — "Invalid login credentials" (password sign-in attempt failed)
- 08:48:38 POST /verify 403 — error_code otp_expired, "One-time token not found"
- 08:48:45 POST /verify 403 — error_code otp_expired, "One-time token not found"
- Analytics log store returned no rows for the window, so the 08:49/08:51 (Dublin 09:49/09:51) presses are not yet visible; the two 08:48 403s match the same symptom (token already consumed).

## 2. auth.users (id 37eed0e6-a0b9-4eb8-9d32-5a8be0d340dd)
- created_at 08:42:47.291 | invited_at 08:42:47.289 | email_confirmed_at 08:43:46.546
- confirmation_sent_at: null | recovery_sent_at: null
- last_sign_in_at 08:43:46.550 | updated_at 08:43:46.996
- encrypted_password set: true

## 3. generateLink / invite / recovery calls for this email today
- Exactly one: provision-tenant generate_link (invite) at 08:42:47. No recovery or magic-link calls. I did not open or test any link myself.

## 4. Configured OTP / link expiry
- No `mailer_otp_exp` / `GOTRUE_MAILER_OTP_EXP` override exists in config.toml or any Edge Function — the platform default applies (1 hour / 3600s). Not confirmed from a live settings endpoint; reported as configured-state only.

## 5. Tenant provisioning
- Org: a7cfa53b-b4cb-4291-a283-69bbb8aa4fc1, name "test gas 3", public_domain null, subscription_status trial.
- provision-tenant ran 08:42:46–08:42:47 (boot 08:42:46, generate_link 08:42:47). auth.users.created_at equals the run time → the email did not exist before this run.

## 6. profiles / engineers
- profiles: organisation_id a7cfa53b-..., role admin, is_active true
- engineers: organisation_id a7cfa53b-..., role admin, status active

## Key fact pattern
The invite token was already consumed at 08:43:46 (the first successful open, which also set a password and signed the user in). Every later press of "Create password" re-verifies the same dead token → otp_expired → "Session expired". Separately: the 08:45 password login failed with invalid credentials despite the password update at 08:43:47, and no audit_log/auth_activity rows exist for the password change.
