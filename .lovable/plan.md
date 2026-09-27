# BJ-NEW-M step 2 — Branded owner invite

## What changes
When a superadmin provisions a new tenant, the owner gets exactly one branded BookedJobs email (via Resend) sent only after every provisioning step succeeds. The admin toast says truthfully whether it was sent.

## provision-tenant/index.ts
1. Step 6 (~line 418): replace `inviteUserByEmail` with `auth.admin.generateLink({ type: "invite", email, options: { data: <same user_metadata> } })` — creates the user without sending an email. `newUserId = data.user.id`; keep `hashed_token` and `linkType = "invite"`.
2. Existing-email branch: keep the current lookup, superadmin guard and cross-org guard exactly as they are; then `generateLink({ type: "recovery", email })`, `linkType = "recovery"`. The "already registered" detection will be adjusted only as far as needed to match the error `generateLink` returns (verified against the real error text, not guessed).
3. All other steps (4, 5, 5b–5e, 6b–6e) untouched.
4. New Step 7a just before `// Step 7: success`:
   - Host: `organisations.public_domain` if non-blank, else `APP_PUBLIC_URL` or `https://app.bookedjobs.ie`; normalised to `https://<host>`, no trailing slash. No fallback host or karlsgas host.
   - Link: `<host>/reset-password?token_hash=<hashed_token>&type=<invite|recovery>` (never `action_link`).
   - Resend: From `BookedJobs <noreply@bookedjobs.ie>`, Reply-To = business_email if given, subject "You've been invited to <company_name> on BookedJobs", body/button/footer as specified, styled like the invite-team-member email, every value HTML-escaped.
   - On failure (including missing key): tenant still succeeds; `logFailure("step 7a", ...)` without link/token.
5. Success response adds `invite_sent` and `invite_error`. Link and token never appear in the response or logs.

## AdminPanel.tsx (toast only, ~line 1667)
- Sent: "✅ <company> provisioned. Invite emailed to <ownerEmail>."
- Failed: warning toast "⚠️ <company> provisioned, but the invite email failed: <invite_error>. Open the tenant and use Send Password Recovery."

## Not touched
requirePlatformAdmin, guards, slug logic, other steps, invite-team-member, send-reset-email, auth-email-hook, ResetPassword.tsx.

## Deploy and verify
- Typecheck/tests, then deploy only `provision-tenant`; report timestamp.
- Report full diff of both files and commit hashes. Note: the workspace is on an edit branch (`edit/edt-39431c70...`), not `dev`; I can't commit to `dev` directly, so I will report the real hashes and branch.
- Live test: I'll need an owner email address you control for the scratch tenant "Test Invite Gas". I can check what the email service accepted and the link host/path. You'll need to confirm only one email arrived, open it in a private window, set a password and check you land in Test Invite Gas. I'll report the toast text.

## Risk
High: this touches auth and tenant provisioning, so it needs the full review process. The change is kept small, and the scratch tenant will be labelled for cleanup.
