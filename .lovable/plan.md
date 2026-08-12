# Lock down send-block-notification

## Branch gate

The workspace is on `edit/edt-5031ea3d-86b7-497f-8052-ce75da52b3a4`, **not `dev`**. As with the earlier tracks, the workspace always checks out an ephemeral `edit/edt-…` branch, so a `dev` precondition can't be satisfied from here. Last time you said "proceed on the current branch" — this plan assumes the same. Say otherwise and I'll hold.

## Current state (verified)

- `supabase/config.toml` line 85: `[functions.send-block-notification]` has `verify_jwt = false`.
- `supabase/functions/send-block-notification/index.ts` has no Supabase client and no caller check — it validates only `email` format and `reason` length, then POSTs to Resend. Anyone with the anon key can send arbitrary HTML to any address from `noreply@bookedjobs.ie`.
- Only call site: `src/pages/AdminPanel.tsx:506` inside `handleConfirmBlock`.
- AdminPanel's own access guard (lines 374–379): selects `profiles.role` for the current user and rejects unless `role === "superadmin"`. There is no route-level guard on `/admin` in `App.tsx` — the page-level check is the gate.

## Changes

### 1. `supabase/config.toml`
Line 85 block: `verify_jwt = false` → `verify_jwt = true`.

### 2. `supabase/functions/send-block-notification/index.ts`
Add an auth preamble ahead of the existing body parsing, matching the `deactivate-user` shape:

- Require `Authorization: Bearer …`; 401 otherwise.
- Resolve the caller with an anon client `auth.getUser(token)`; 401 on error or no user.
- With a service-role client, read `profiles.role` for `caller.id`.
- Allow only `role === 'superadmin'` — mirrors AdminPanel's guard exactly. Anything else returns 403 `{ error: "Forbidden" }`. Note: unlike `deactivate-user`, this will **not** include the `PLATFORM_OWNER_EMAILS` email bypass, because AdminPanel itself doesn't have one; the platform owner account is already `superadmin`.
- All new responses reuse the existing `json()` helper so CORS headers stay attached.

Everything else stays byte-identical: `RESEND_API_KEY` check, email/reason validation, `buildHtml`, the Resend POST, subject, from address, and the 502/500 error paths.

### 3. Frontend
No change needed. `supabase.functions.invoke` already attaches the caller's JWT, and the modal is only reachable from the superadmin-gated AdminPanel.

## Risk

Low, one behaviour change to note: after this, a non-superadmin (or an expired session) hitting the block modal gets `Blocked, but email failed: Forbidden` in the toast — the tenant is still marked `is_blocked` because that DB write happens before the invoke. Blocking itself is unaffected.

## Verification

- `tsgo` for the frontend (no frontend edits, so this is just a regression check).
- `deno check` on the edited function.
- No DB migration, no schema change.
