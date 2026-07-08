
## Scope

One new migration + notification-insert removal in 5 files. No other changes.

---

## 1) New migration — `notify_on_job_message` trigger

Creates a SECURITY DEFINER function + AFTER INSERT trigger on `public.job_messages` that mirrors the current client-side behavior:

- If `NEW.sender_role = 'engineer'` → fan out to **all** users in the org where `engineers.role IN ('admin','office','owner')` and `auth_user_id IS NOT NULL AND auth_user_id != NEW.sender_id`. Notification `role = 'office'`.
- Else (sender is office/admin/owner or anything non-engineer) → notify **only the assigned engineer**: look up `service_calls.assigned_engineer_id` → `engineers.auth_user_id`. Insert one notification with `role = 'engineer'`. Skip if the assigned engineer is the sender or unassigned.

Each notification row:
```
organisation_id     = service_calls.organisation_id
recipient_user_id   = <resolved above>
notification_type   = 'message'
title               = 'New Message – ' || COALESCE(job_reference, 'Job')
body                = LEFT(NEW.message, 100)
job_id              = NEW.job_id
role                = 'office' | 'engineer'
is_read             = false
created_at          = now()
```

Notes:
- `SECURITY DEFINER`, `SET search_path = public`.
- Skips silently when `NEW.job_id` is NULL, when the service_call is missing, or when there are no eligible recipients (no error).
- Idempotent trigger name: `DROP TRIGGER IF EXISTS on_job_message_insert ON public.job_messages` before `CREATE TRIGGER`.

---

## 2) Client-side notification inserts to remove

In each file below, remove **only** the `supabase.from("notifications").insert({...})` call (and any local variables that exist solely to build that payload, e.g. `officeUserId` lookups, `engineerName`, `invoiceNumber`, `fullName` computations that are only used for the notification). Do NOT touch the `job_messages.insert()` call, toasts, form state, navigation, or error handling.

- `src/components/engineer/MessageOfficeModal.tsx` — remove the `if (officeUserId) { await supabase.from("notifications").insert(...) }` block (around line 86-99).
- `src/components/messages/EngineerJobMessages.tsx` — remove the notifications.insert around line 68.
- `src/components/messages/InlineOfficeReply.tsx` — remove the notifications.insert around line 68.
- `src/components/messages/MessageEngineerModal.tsx` — remove the notifications.insert around line 79.
- `src/components/messages/DirectMessageThread.tsx` — remove the notifications.insert around line 122.

Any `officeUserId` / recipient props on these components stay in the type signatures for now (removing them would ripple into other files); only the actual insert call is deleted.

---

## 3) Verify

After the migration + edits:
- Send an engineer→office test message via `job_messages` → confirm one notification row per office/admin/owner in the org (excluding the sender).
- Send an office→engineer message → confirm one notification row for the assigned engineer only.
- Check `MessageAlertBanner` still fires in both apps (unchanged file).

## Out of scope

Every other file. The `MessageAlertBanner`, notification RLS/GRANTs, and existing `notify_on_job_change` trigger remain untouched.
