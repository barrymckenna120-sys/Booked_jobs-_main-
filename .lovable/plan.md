
## Scope

Three files change, plus a one-off data update for Nicole. No other files touched.

---

### 1) `supabase/functions/list-users/index.ts`

In the org-scoped branch (the only branch that returns users to the Unblock UI):

- Extend the `engineers` select to include `status`: `.select("auth_user_id, name, role, status")`.
- Build a `blockedByEngineerAuthId` set from rows where `status === 'blocked'`.
- When populating the returned user object, set `blocked = (authBanned) || (engineerStatusBlocked)`.
- Apply the same combined check in the default (all-auth-users) branch by best-effort joining engineers on `auth_user_id` (single `engineers.select('auth_user_id, status').eq('status','blocked')` call, build a Set, OR into `blocked`).
- Re-deploy `list-users`.

Org scoping is already enforced via `organisation_id` on the engineers query; roles are not filtered so engineer/office/admin/owner all included.

---

### 2) `supabase/functions/reset-auth-block/index.ts`

Make it idempotent and non-fatal for either side being already clear:

- Keep `updateUserById(..., { ban_duration: "none", email_confirm: true })`. Treat any error whose message indicates "not banned"/no-op as success; only fail on other errors. In practice `ban_duration:"none"` already succeeds when the user isn't banned, so just log and continue instead of returning 500.
- Keep the engineers UPDATE (status/blocked_reason/is_available). A zero-row match is NOT an error — do not treat `data:[]` as failure. Only return 500 on a real Postgres error.
- Return `{ success: true, userId, clearedAuthBan: boolean, clearedEngineerRow: boolean }` so the UI can reflect what happened, but the response stays 200 as long as neither call errored.
- Re-deploy `reset-auth-block`.

Auth check (admin/superadmin) and org scoping already work for all tenants since the update targets `auth_user_id` which is globally unique.

---

### 3) `src/pages/Auth.tsx`

- On mount (inside the existing `useEffect`), remove any legacy cached-block keys:
  `localStorage.removeItem("auth_blocked")`, `"blocked_email"`, `"is_blocked"`, plus iterate keys starting with `"auth_blocked_"` and delete them. This ensures no stale UI state from prior versions.
- Remove `isBlocked` from the Sign-In button's `disabled` prop and from the password input's `disabled` prop, and drop the `if (isBlocked) return;` guard in `handleSubmit`. Users can always attempt login; server is source of truth.
- When a `user_banned` error is caught, write `localStorage.setItem("bj_prev_blocked:" + emailLower, "1")` (so we can detect a later "unblocked" state), keep showing the red `BLOCKED_AUTH_ERROR` message, but do NOT permanently disable the form.
- Add a small green helper below the email field: when the current `email` (lowercased, trimmed) has a `bj_prev_blocked:<email>` flag AND `formError` is null, render `"Your account has been unblocked. You can now sign in."` in `text-green-600`. Clear the flag on successful sign-in.
- Keep the 5-failed-attempts lock-out flow as-is (that is a separate mechanism), but stop hard-disabling the button afterwards — the modal already communicates the state, and the server will reject if truly locked.

---

### 4) Immediate data fix — Nicole

Run one UPDATE via the insert tool:

```sql
UPDATE public.engineers
SET status = 'active',
    blocked_reason = NULL,
    is_available = true
WHERE auth_user_id = '574c0743-d9f4-4b7e-a1c5-0c5768cff881';
```

Also call `reset-auth-block` (or `auth.admin.updateUserById`) to clear any auth ban for the same user for safety.

---

## Deployment

After edits: deploy `list-users` and `reset-auth-block`, then verify with `curl_edge_functions` that `list-users` returns `blocked:true` for an engineers-only-blocked user, and `reset-auth-block` returns 200 for a user with no engineers row.

## Out of scope

`AdminPanel.tsx`, `UnblockUserPopover`, and every other file remain untouched.
