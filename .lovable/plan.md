
# Staff deactivation (soft-delete) plan

Replace the current hard delete with a reversible **deactivate** action that stops sign-in, hides the user from assign/fan-out lists, preserves audit history, and can be reactivated.

## Design decisions (locked from audit)

- Staff identity lives in **two** tables: `profiles` (role/org) and `engineers` (operational). Both must reflect deactivation.
- There is **no auth chokepoint** — the only reliable way to actually stop a signed-out user from returning is `auth.users.banned_until`. We piggyback on that.
- Notification fan-out and most assign dropdowns read from `engineers`, not `profiles`. Filter changes go there.
- FK constraints on `customer_activity.created_by` and `service_call_tags.added_by` → `profiles.id` are why hard-delete is fragile. Soft-delete removes that risk.

## Schema

Migration adds:

- `profiles.is_active boolean NOT NULL DEFAULT true`
- `profiles.deactivated_at timestamptz`
- `profiles.deactivated_by uuid` (auth user id of admin)
- Index: `profiles(organisation_id) WHERE is_active = false` (small, used by admin view).

`engineers` already has `status` (`'active' | 'blocked' | new: 'deactivated'`). We introduce the `'deactivated'` value rather than a new column — keeps existing `.eq('status','active')` filters correct for free.

No RLS change required for the new columns (existing `profiles_*` policies cover them).

## Deactivate flow (replaces `handleDelete` in `src/pages/TeamManagement.tsx`)

Rename UI: "Remove" → "Deactivate". Confirmation copy: "Deactivate {name}? They will lose access immediately and can be reactivated later."

New edge function `deactivate-user` (service role, superadmin/admin/office/owner gated exactly like `unblock-user`):

1. Guard: count `service_calls` where `assigned_engineer_id = engineer.id AND status NOT IN ('Completed','Cancelled')` — **Titlecase** (fixes the existing lowercase bug that silently allows deletion of users with active jobs).
2. If active jobs > 0, return `{ error: 'active_jobs', count }` → UI shows the existing "Cannot remove …" toast, wording updated to "Cannot deactivate …".
3. Otherwise, in a single service-role transaction:
   - `UPDATE engineers SET status='deactivated', is_available=false WHERE id=$1`
   - `UPDATE profiles SET is_active=false, deactivated_at=now(), deactivated_by=$caller WHERE user_id=$auth_user_id`
   - `auth.admin.updateUserById(auth_user_id, { ban_duration: '876000h' })` (100 years — same trick used for lockouts; reversible).
4. Return `{ ok: true }`.

Reactivate flow: extend the existing **Unblock** action. `unblock-user` already clears `banned_until` and resets `engineers.status='active'`; add `UPDATE profiles SET is_active=true, deactivated_at=null, deactivated_by=null`. UI shows "Reactivate" instead of "Unblock" when `status='deactivated'`.

Hard delete (`engineers.delete()` + `profiles.delete()`) is **removed** from the client. If a true hard-delete is ever needed, it becomes a separate superadmin-only edge function — not in scope here.

## Filter changes (listings + fan-out)

**Frontend — add `.neq('status','deactivated')` (or keep `.eq('status','active')`):**

- `src/pages/Schedule.tsx:135` — currently unfiltered. Add filter.
- `src/pages/EngineerAvailability.tsx:68` — currently unfiltered. Add filter.
- `src/components/incoming/JobReviewPanel.tsx:79`, `src/components/renewals/BookServiceSheet.tsx:50` — currently filter by `is_available` only. Add `status='active'`.
- All existing `.eq('status','active')` sites (`JobDetail`, `Quotes`, `NewJobPanel`) already correct — no change.
- `TeamManagement.tsx` list itself: keep showing deactivated users, marked with a "Deactivated" pill (mirrors current "Blocked" pill).

**DB — notification fan-out triggers:**

Update the four SECURITY DEFINER functions (`notify_on_job_change`, `notify_on_job_message`, `notify_on_video_upload`, `mark_quote_viewed`) so every `SELECT ... FROM engineers WHERE role IN ('admin','office','owner') AND auth_user_id IS NOT NULL` also has `AND status = 'active'`. Deactivated users stop receiving in-app notifications.

## Audit

Reuse `src/lib/auditLog.ts`. New action types:

- `user_deactivated` — `entity_type='user'`, `entity_id=engineer.id`, `metadata={ auth_user_id, reason? }`
- `user_reactivated` — same shape

Existing `user_removed` action_type stays in schema for historic rows; no new emissions.

## Files touched

Frontend
- `src/pages/TeamManagement.tsx` — replace `handleDelete` with `handleDeactivate`, add `handleReactivate`, dialog copy, status pill.
- `src/pages/Schedule.tsx`, `src/pages/EngineerAvailability.tsx`, `src/components/incoming/JobReviewPanel.tsx`, `src/components/renewals/BookServiceSheet.tsx` — filter tweaks.

Backend
- Migration: `profiles` new columns + index.
- Migration: update the four notification trigger functions to filter `status='active'`.
- Edge function: `supabase/functions/deactivate-user/index.ts` (new, JWT-verified, admin/office/owner/superadmin).
- Edge function: `supabase/functions/unblock-user/index.ts` — extend to clear `profiles.is_active` fields.

## Out of scope (call out explicitly)

- No shared auth middleware for edge functions (separate hardening track).
- No RLS enforcement of `is_active` — deactivation stops sign-in via `banned_until`; RLS keeps working off `auth.uid()` as today.
- No cascade to reassign the deactivated user's open jobs — the guard blocks deactivation until they're cleared by an admin manually (same UX as today's delete guard, now actually working).
- FK owners (`customer_activity.created_by`, `service_call_tags.added_by`) are preserved as-is — soft-delete keeps the profile row so history stays intact.

## Rollout order

1. Migration (schema + trigger updates).
2. `deactivate-user` + `unblock-user` extension deployed.
3. Frontend swap of Remove → Deactivate/Reactivate.
4. Filter tweaks on the four listing sites.
