# BJ-0060 — Superadmin always receives office job notifications

## Problem

Office-facing job notifications (En Route, On Site, Start Work, etc.) are addressed only to
rows in `engineers` with role admin/office/owner and a linked login. A superadmin session has
no `engineers` row, so the office app bell and sound never fire for that session — which is why
Karl's En Route on KN-515 produced a notification for Nicole but nothing for the superadmin
who was logged in.

## Change

One migration that redefines `public.notify_on_job_change()`. Every office-recipient loop gets
the same replacement — the existing engineers query is wrapped in a subquery that also unions in
every superadmin login, with the actor-exclusion applied once on the outside so a superadmin's
own actions still don't notify themselves.

Recipient resolution becomes:

```text
SELECT DISTINCT auth_user_id FROM (
  SELECT auth_user_id FROM public.engineers
  WHERE organisation_id = NEW.organisation_id
    AND role IN ('admin','office','owner')
    AND status = 'active'
    AND auth_user_id IS NOT NULL
  UNION
  SELECT user_id FROM public.profiles
  WHERE role = 'superadmin' AND user_id IS NOT NULL
) recipients
WHERE (auth.uid() IS NULL OR auth_user_id <> auth.uid())
```

Superadmins are resolved dynamically from `profiles` rather than hardcoding
`ed429061-7b76-4272-af4a-25249ee6d719`, so adding or changing a superadmin needs no migration.

### Applied to all 12 office loops, identically

INSERT-time: Tally Form `new_job`, `new_repair`.
UPDATE-time: reassigned-office, en_route, on_site, in_progress, cancelled-office, no_show,
parts_needed, payment_collected, completed, follow_up.

(Your task named 8; the quoted pattern actually occurs 12 times. All 12 are treated the same,
per your answer, so there is no variation between branches.)

### Explicitly unchanged

- The three single-recipient engineer INSERTs (new job assigned, reassigned-to-engineer,
  cancelled-engineer notice) — they use `SELECT ... INTO` and are untouched.
- Actor-exclusion semantics, notification titles/bodies/metadata, branch conditions, `role`
  column values, `organisation_id` stamping.
- No `engineers` table data changes, no client-side code changes.

## Verification

1. Create a scratch job in K&N assigned to Karl.
2. Press En Route as Karl through the engineer app.
3. Confirm exactly two `notifications` rows for that job: Nicole (`574c0743…`) and the
   superadmin (`ed429061…`), both with `organisation_id` set and type `en_route`.
4. Confirm the office app bell badge increments and the sound fires while signed in as the
   superadmin (the existing `useNotifications` realtime filter matches on `recipient_user_id`).
5. Delete the scratch job and its activity rows.

## Note

Superadmin is platform-wide, so this routes office job notifications for every tenant to the
superadmin bell — expected for an operator account, but it will be noisier as more orgs go live.
