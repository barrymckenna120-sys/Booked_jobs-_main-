# Close out 7 stale K&N jobs on the deactivated engineer record

## Before-state (verified now, live data)

Engineer reference: `d7a1e4dc-e4b7-4ca7-bfb5-dd79bb63f70d` (deactivated K&N record)

| Ref | Status | Scheduled | assigned_engineer_id | assigned_engineer (text) | customer_id |
|---|---|---|---|---|---|
| KN-389 | On Site | 2026-06-30 | d7a1e4dc… | Barry test KN | 783e82ff-c276-4e3c-b116-d92c95fb552a |
| KN-390 | Booked | 2026-07-02 | d7a1e4dc… | Barry test KN | e0fbebea-ab69-42c0-9c76-eaad6c763f52 |
| KN-391 | Booked | 2026-07-01 | d7a1e4dc… | Barry test KN | 783e82ff-c276-4e3c-b116-d92c95fb552a |
| KN-393 | Booked | 2026-07-03 | d7a1e4dc… | Paul | 783e82ff-c276-4e3c-b116-d92c95fb552a |
| KN-394 | Booked | 2026-07-02 | d7a1e4dc… | Barry test KN | e0fbebea-ab69-42c0-9c76-eaad6c763f52 |
| KN-397 | Booked | 2026-07-03 | d7a1e4dc… | Barry test KN | 783e82ff-c276-4e3c-b116-d92c95fb552a |
| KN-423 | Booked | 2026-07-30 | d7a1e4dc… | Paul | 272160a5-f06c-48b9-ad4d-44af558d30e4 |

All 7 have `completed_at` NULL and `follow_up_needed` false. Exactly 7 rows reference this engineer id.

## Which status value to use: `archived`

The app already has a close-out status. The Schedule page's archive action writes `status: "archived"` (lowercase), and the schedule/day filters explicitly exclude `archived` alongside `Completed` and `Cancelled`. There are 97 existing `archived` rows, so this is the established value — no new status invented, and not `Completed`.

Chosen: `archived` rather than `Cancelled`, because `Cancelled` implies a cancelled booking and (see below) does fire in-app notifications.

## Notification risk check (the KN-389 'On Site' question)

The only status-driven automation on `service_calls` is the `notify_on_job_change` trigger. It fires on transitions **into** `En Route`, `On Site`, `In Progress`, `Cancelled`, `no_show`, `parts_needed`, `Completed`. Findings:

- Transitions **away from** `On Site` are not watched at all — nothing fires for KN-389 leaving `On Site`.
- `archived` is not in the watched list, so setting `archived` fires zero notifications.
- Had we used `Cancelled`, the trigger would have inserted in-app notifications to office users and the assigned engineer for all 7 jobs. Another reason to use `archived`.
- The completed-activity trigger only fires on `Completed`, so no `customer_activity` rows are written.
- All customer-facing WhatsApp/reminder sends are triggered explicitly from the app or Make scenarios, never from a database status trigger, so no customer message can result from this change.

Net risk: none. No customer-facing message, no in-app notification.

## The change

Data-only update (no schema change, no code change, no deletes):

```sql
UPDATE service_calls
SET status = 'archived'
WHERE assigned_engineer_id = 'd7a1e4dc-e4b7-4ca7-bfb5-dd79bb63f70d'
  AND job_reference IN ('KN-389','KN-390','KN-391','KN-393','KN-394','KN-397','KN-423');
```

Rows stay in place; customer links, references and history are preserved. The engineer reference is left as-is so the historical record of who it was assigned to survives.

## Verification after the change

1. Re-paste the same 7 rows with their new status.
2. `SELECT status, count(*) FROM service_calls GROUP BY 1` compared against the before-state counts — expected: `archived` 97 → 104, `Booked` 84 → 78, `On Site` 2 → 1, everything else unchanged.
3. Confirm no rows outside the 7 changed by checking the total row count and that no other `updated_at` moved.

## Note

There is one live database on this project — no separate dev copy — so this runs against production data. It is a reversible status flip on 7 identified rows, with the before-state recorded above.
