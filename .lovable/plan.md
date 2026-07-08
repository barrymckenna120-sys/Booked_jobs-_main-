
# Audit — `role IN ('admin','office')` occurrences

Read-only report. No changes proposed. Grouped by risk of incorrectly excluding `owner` / `manager` / `superadmin`.

Note on role model: `useUserRole.ts:68` and `Auth.tsx:90` treat `owner`, `manager`, `admin`, `office` as the "elevated / office-capable" set. Any check that lists only `admin, office` is therefore narrower than the app's own definition of "office user" and is a candidate bug for owners.

---

## 1. RLS policies — CURRENT DB STATE (from `pg_policies`)

### 1a. HIGH RISK — owner denied

| Table | Policy | Cmd | Gates |
|---|---|---|---|
| `boiler_brands` | Admin/office can insert/update/delete | I/U/D | Owner cannot add/edit/delete boiler brand catalog. |
| `debug_logs` | Admin/office can read/delete | S/D | Owner cannot view debug logs. |
| `edge_function_logs` | Admins can read / delete logs | S/D | Owner cannot view edge function logs (SystemLogs page). |
| `notifications` | `notifications_select` — org-wide read fallback is `('admin','owner','office')` | S | ✅ includes owner. **Missing `manager`** — a manager can only see own notifications, not org-wide. |

### 1b. LOW RISK — owner/manager already included

- `categories` (I/U/D) — includes `admin, office, owner, manager`. OK.
- `products` (I/U/D) — includes `admin, office, owner, manager`. OK.
- `conversations` SELECT — includes `admin, office, owner, manager`. OK.
- `engineers` insert/update — includes `admin, owner, office, manager, superadmin`. OK.

---

## 2. Database functions (SECURITY DEFINER — bypass RLS but drive notifications)

### 2a. HIGH RISK — owner never receives office fan-out notifications

`public.notify_on_job_change()` — 10 recipient-selection blocks, all use:

```sql
FROM public.engineers
WHERE organisation_id = NEW.organisation_id
  AND role IN ('admin', 'office')
  AND auth_user_id IS NOT NULL
  AND auth_user_id != NEW.user_id
```

Gates the following office notifications for every non-actor recipient:
- `new_job` (Tally Form intake)
- `new_repair` (Repair/Emergency intake)
- `reassigned` (engineer reassignment fan-out)
- `en_route`, `on_site`, `in_progress`
- `cancelled`, `no_show`, `parts_needed`
- `completed`, `payment_collected`, `follow_up`

If the organisation owner is stored as `engineers.role = 'owner'` (or `manager`), they **do not** receive any of these bell/toast notifications. This matches the "office bell silence" symptom.

Same pattern in `public.respond_to_quote()` and `public.mark_quote_viewed()` — quote-accepted and quote-viewed fan-out to other office users uses `role IN ('admin','office')`. Owner is excluded.

---

## 3. Edge functions

| File:line | Check | Gates | Owner impact |
|---|---|---|---|
| `supabase/functions/list-users/index.ts:87` | `legacyRole === "admin" \|\| legacyRole === "office"` | Auth to call list-users | Mitigated by later fallback that also authorises `organisations.owner_user_id = callerId`, so owner still passes. Low risk. |
| `supabase/functions/invite-team-member/index.ts:60` | `['admin','office','owner','owner_manager','superadmin']` | Invite team members | Owner included. OK. |
| `supabase/functions/unblock-user/index.ts:51` | `["admin","office","owner","manager"]` | Unblock user | Owner included. OK. |
| `supabase/functions/send-email/index.ts:13` | Role label mapping | Cosmetic email label only | Owner would render as "Engineer" label. Cosmetic only. |

---

## 4. Client-side (React)

| File:line | Check | Gates | Owner impact |
|---|---|---|---|
| `src/hooks/useUserRole.ts:68` | `["owner","manager","admin","office"].includes(rawRole)` → `canAccessOffice` | Office route access | Owner included. OK — this is the canonical definition. |
| `src/pages/Auth.tsx:90` | Same set | Post-login redirect to office | OK. |
| `src/components/engineer/EngineerLayout.tsx:40` | `canAccessOffice \|\| role === "admin" \|\| role === "office"` | "Switch to Office" button in engineer layout | Owner covered via `canAccessOffice`. OK. |
| `src/components/jobs/ExtraWorkPendingCard.tsx:167` | `role === "admin" \|\| role === "office"` | Shows Approve/Reject extra-work buttons | **HIGH RISK** — owner logged in as owner role sees the card but cannot approve/reject. |
| `src/components/notifications/NotificationDrawer.tsx:67` | `n.role === "office" \|\| n.role === "admin"` | Filters notifications into the "Office" tab | Filter is on the notification row's `role` field (which is always `'office'` or `'engineer'` per the trigger), not the viewer's role. **Not** an owner-exclusion bug. OK. |

---

## Summary of owner-exclusion bugs (candidates for a follow-up fix)

1. **DB triggers/functions** — `notify_on_job_change`, `respond_to_quote`, `mark_quote_viewed` fan-out lists exclude `owner` and `manager`. This is the most likely cause of the reported "office bell doesn't fire" symptom for owner accounts.
2. **RLS on `boiler_brands`, `debug_logs`, `edge_function_logs`** — owner cannot manage boiler brands or view logs.
3. **RLS on `notifications`** — owner is included, but `manager` is not (org-wide read).
4. **`ExtraWorkPendingCard.tsx:167`** — owner cannot approve/reject extra work from the UI.

No files will be modified until you approve a fix plan.
