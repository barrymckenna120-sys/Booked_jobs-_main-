# Seed a clean test row for the office → engineer parts notification

## Why

KN-427 proved nothing because Nicole logged the row, Nicole is the job's assigned engineer, and Nicole made the change — every candidate target was the actor, so the trigger correctly suppressed it. To see the notification land we need a row owned by someone other than the office user doing the update.

Karl is the only properly linked engineer in K&N:

```text
engineers.id   55b9ba7b-4cfe-4f4f-8edb-7cc78e14dd2e
name           Karl
auth_user_id   57ebf8de-b2d3-44bc-90b0-071d750a3f46   (active)
profiles.role  engineer
organisation   8c37827f-ce2c-4507-a821-a5e807d89856   (K&N)
```

## What gets created

One `parts_requests` row in K&N, clearly marked as test data:

- status `Open`, priority normal
- `engineer_id` = Karl's auth user id, `logged_by` = same, `logged_by_name` = "Karl"
- linked to an existing K&N job so the notification body carries a real job reference and customer name
- description something obvious like "TEST — thermostat (notification check)"

No schema, RLS, or trigger changes. Data only.

## How you test it

1. Sign in as Nicole (office) and open `/parts`.
2. Find the "TEST — thermostat" request and move it Open → Ordered.
3. Sign in as Karl (`engapp@bookedjobs.ie`) — the bell should show **Part Request Updated**, body ending "· status now Ordered".
4. Repeat with Ordered → Ready to Fit to cover the transition that has never actually been exercised, and confirm the pill switches to the box-with-check glyph.
5. Reverse direction: as Karl on `/engineer/parts`, cancel the row — every office/admin/owner/manager user in K&N should get **Part Request Cancelled**.

Note that Karl's "My Parts" list only shows rows carrying `engineer_id`, so this seeded row will appear there; his older row attached via the legacy `assigned_to` column still will not. That backfill is a separate decision, not part of this change.

## Cleanup

The row is disposable — say the word once you're done and I'll delete it.
