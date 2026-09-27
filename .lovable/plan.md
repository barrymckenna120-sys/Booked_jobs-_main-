# BJ-NEW-M step 3 — Password recovery works for every tenant

Confirmed by code read: `send-reset-email` skips the send when no tenant domain resolves (the "test gas 3" case), uses the non-scanner-safe `action_link`, and `listUsers()` reads only the first page (default 50). `_shared/platformAdmin.ts` exists for the superadmin check. `TenantDetail.tsx` `handleSendReset` currently always shows a success toast.

## Changes — `supabase/functions/send-reset-email/index.ts`

1. **Host resolution, first non-blank wins:** `organisations.public_domain` → `tenant_integrations` whatsapp `config.domain` → `Deno.env.get("APP_PUBLIC_URL") || "https://app.bookedjobs.ie"`. The send is never skipped for a missing domain. Never another tenant's host, never `PLATFORM_PUBLIC_HOST_FALLBACK`, never a hardcoded karlsgas host. Normalise to `https://<host>` with no trailing slash (handles values already carrying a scheme).
2. **Scanner-safe link:** from `generateLink({ type: "recovery", email })` take `properties.hashed_token` and build `<host>/reset-password?token_hash=<hashed_token>&type=recovery`. Stop using `properties.action_link`.
3. **User lookup:** page through `listUsers({ page, perPage: 1000 })` until a page returns fewer than 1000, matching email case-insensitively.
4. **Response shape:** if the request has an Authorization bearer token AND `_shared/platformAdmin.ts` confirms a platform admin, return `{ success: true, sent: true|false, reason: <text|null> }` with the real reason (user not found / Resend error). Everyone else keeps the generic `{ success: true }` so addresses can't be probed. The link and token are never returned or logged.
5. **Unchanged:** Resend email design, From address, CORS handling, no template wording changes.

## Changes — `src/pages/admin/TenantDetail.tsx` (handleSendReset only)

- If `data.sent === false`: error toast `Reset email NOT sent: <reason>`. Otherwise keep the current success toast.

## Explicitly not touched

- provision-tenant, invite-team-member, ResetPassword.tsx, email template wording.

## Verification

- Deploy only `send-reset-email`; report deploy timestamp.
- Live tests, reporting function log lines (no tokens):
  1. /admin → "test gas 3" → Send Password Recovery for barrytest2024+2@gmail.com — email arrives; link host/path = `<APP_PUBLIC_URL host>/reset-password?token_hash=…&type=recovery` (host/path only reported).
  2. Login page "Forgot password" for the same email — email arrives.
  3. Login page "Forgot password" for a made-up email — generic success, no email sent.
- Report: full diff of both files, commit hash, deploy timestamp.

## Note on branch

Recent work has been auto-committing to an edit branch, not `dev`. I will report the actual commit hash and branch; merging to `dev` may need a separate step.
