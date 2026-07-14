
## Approved plan — executing on build-mode switch

### Step 1 — Flip Karl's `can_access_office` to false

```sql
UPDATE public.engineers
SET can_access_office = false, updated_at = now()
WHERE auth_user_id = '57ebf8de-b2d3-44bc-90b0-071d750a3f46'
  AND organisation_id = '8c37827f-ce2c-4507-a821-a5e807d89856';
```

Then verify by reselecting Karl's `profiles.role` (`engineer`), `engineers.role` (`engineer`), `engineers.can_access_office` (`false`).

### Step 2 — Audit other engineers with office access

Read-only query across all orgs, report only (no bulk update):

```sql
SELECT o.name AS organisation, e.id AS engineer_id, e.name, e.role,
       e.can_access_office, e.auth_user_id, p.role AS profile_role, e.updated_at
FROM public.engineers e
LEFT JOIN public.organisations o ON o.id = e.organisation_id
LEFT JOIN public.profiles p ON p.user_id = e.auth_user_id
WHERE e.role = 'engineer' AND e.can_access_office = true
ORDER BY o.name, e.name;
```

Present the full list; wait for user to nominate which (if any) to also flip.

### Step 3 — Live login proof (Option A, temporary password)

1. Use the admin API to set a temporary password for `engapp@bookedjobs.ie` (via a one-shot edge function call or `supabase.auth.admin.updateUserById`).
2. Playwright, fresh Chromium context, no stored session:
   - Navigate to `/auth`, sign in as Karl with the temp password.
   - Capture post-login landing URL — expect `/engineer/today`.
   - Attempt direct nav to `/dashboard`, `/schedule`, `/customers`, `/warranty`, `/insights`, `/settings`, `/admin`. Screenshot each. Expect all office/admin routes to bounce him back to the engineer app (or `/dashboard` → engineer, per `RootRoute` + `OfficeRoute`).
   - Confirm no office UI is reachable and no admin banner surfaces.
3. Rotate the password again immediately after — set to a fresh random value so the temp password can't be reused. Karl uses "forgot password" next time he needs in.

Report: screenshots, final observed routes, and confirmation the temp password was rotated out.

### Out of scope

Bulk-flipping other engineer flags, changing `profiles.role` / `engineers.role`, or any routing/gating code changes.
