# Parts request notifications + icon consistency

Adds two database triggers on parts requests so the right people get told when something changes, renders them through the existing notification system, and cleans up one icon inconsistency on the office side.

No changes to the parts requests table structure, its access rules, or any component from earlier prompts beyond what rendering requires.

## 1. Cancellation notifies office

New trigger on parts requests: when a row's status becomes `Cancelled`, fan out one notification per office-side user in that organisation, using the same mechanism as the existing job-change trigger (loop over `public.engineers` where `role in ('admin','office','owner','manager','superadmin')`, `status = 'active'`, `auth_user_id is not null`, excluding the actor, and insert into `public.notifications` with `organisation_id`, `role = 'office'`).

Body references: the part description, the linked job's `job_reference` (or "no job linked"), the customer name (snapshot column, falling back to the linked customer), and who cancelled it, resolved to a display name via `profiles`.

Notification type: `parts_cancelled`.

## 2. Office note/status change notifies the engineer

Same trigger function, update branch: fires only when `notes` or `status` actually changed value (`is distinct from`), and only when the actor's role resolves to an office-side role via the existing `get_user_role(auth.uid())` helper. Engineers editing their own row produce nothing, and an update that touches any other column produces nothing.

Recipients: the row's `engineer_id` and `assigned_engineer_id` (both, de-duplicated, when they are different people). Skipped when both are null.

Notification type: `parts_update`.

## 3. Rendering

The existing path handles this with no new UI: `useNotifications` fetches by recipient and subscribes to realtime inserts, and `NotificationDrawer` / `NotificationBanner` / `NotificationToast` all fall back to the `new_job` style for unknown types. To make the two new types read correctly rather than as "New Job", the change adds:

- `parts_cancelled` and `parts_update` to the `NotificationType` union in `useNotifications.ts`
- entries in the three `typeConfig` maps: `parts_cancelled` (XCircle, destructive, "Part Cancelled"), `parts_update` (PackageCheck, amber, "Part Update")

That is display metadata only — no new components, no changes to fetching, sound, or click routing.

## 4. Icon consistency (cosmetic)

There is no New Order form in the codebase today, so nothing to align there. Office-side "Ready to Fit" currently does not use `PackageCheck`:

- `src/pages/Parts.tsx` — the "Part Arrived" action and the Ready to Fit column header use `CalendarClock` / an emoji
- `src/components/dashboard/PartsPanel.tsx` — uses `CheckCircle2` on the mark-ready action

Both switch to `PackageCheck`, matching `PART_STATUS_ICON_KEY` and the engineer My Parts list. Icon swap only.

## 5. Verification (actual output pasted back)

Run against the live database with temporary rows, then removed:

1. Engineer cancels a temp row → query `notifications` for the inserted rows and paste them (recipients, title, body).
2. Office updates `notes` on a temp `Ordered` row assigned to a test engineer → paste the engineer's notification row.
3. Negative: engineer updates own `Open` row's notes → paste the zero-row result.
4. Negative: update `quantity` only → paste the zero-row result.
5. `PackageCheck` for Ready to Fit confirmed across engineer My Parts, office Parts list and dashboard panel (screenshot).
6. Delete temp parts rows and the notifications they generated, then re-paste `count(*)` for both tables against the pre-test baseline (`parts_requests` = 9, `notifications` = 699).

## Technical notes

- One trigger function, `notify_on_parts_request_change()`, `AFTER INSERT OR UPDATE`, security definer, `set search_path = public`, mirroring the style of `notify_on_job_change()`.
- Actor role via `public.get_user_role(auth.uid())`; when `auth.uid()` is null (service role / cron), the office-update branch does not fire.
- Cancellation notifications fire regardless of actor role, since either side can cancel.
- Column names used as they exist today: `description`, `customer_name`, `cancelled_by`, `engineer_id`, `assigned_engineer_id`, `service_call_id`, `organisation_id`.
- `notifications.job_id` is set to `service_call_id` when present so the existing click-through to the job keeps working; null otherwise.
