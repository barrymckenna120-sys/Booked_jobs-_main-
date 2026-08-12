# Notify assigned engineers on office-created parts orders + New Order fixes

## 1. Trigger: add `assigned_to` as a last-resort notify target

`notify_on_parts_request_change` (verified current source) resolves engineer recipients on the update branch from a UNION of `engineer_id`, `assigned_engineer_id`, then — only when both are null — `logged_by` and the linked job's engineer. `assigned_to` is not consulted, so an office-created row with only `assigned_to` set has no target.

Change (one more source, same pattern):

- Before the recipient loop, when `engineer_id IS NULL AND assigned_engineer_id IS NULL AND assigned_to IS NOT NULL`, resolve `v_assigned_auth := (SELECT auth_user_id FROM engineers WHERE id = NEW.assigned_to)`.
- Add a fourth `UNION` branch that yields `v_assigned_auth`, guarded by the same `engineer_id IS NULL AND assigned_engineer_id IS NULL` condition.
- Include `v_assigned_auth` in the early-return guard so rows with an `assigned_to` target no longer bail out.
- Unchanged: `auth.uid() IS NULL` bail-out, the office-role gate, actor exclusion (`uid <> auth.uid()`), the `DISTINCT` dedupe, the cancellation branch, and existing priority order (`engineer_id`/`assigned_engineer_id` win whenever either is set).

Engineers with no app login (`auth_user_id` null) resolve to null and are simply skipped, as today.

## 2. New Order form fixes

`src/components/parts/NewPartsOrderSheet.tsx`:

- Engineer picker query gains `.in("role", ["engineer"])` — currently it loads every active org row regardless of role, so owner/office/admin appear in the list.
- Payload: it currently passes `engineerId: selectedEngineer?.auth_user_id ?? null`, which contradicts the schema decision. Change to `engineerId: null` so `assigned_to` is the only engineer reference written; `assigned_engineer_id` is already never set.
- The "no app login, so no notification was sent" toast wording stays (still accurate — it depends on `auth_user_id`, which the trigger now resolves from `assigned_to`).

## 3. Identity repair

Clear the dead `user_id` on engineer `5473f748-…` ("nicole enginner") — `auth_user_id` was cleared in the earlier repair, this legacy column still holds a reference to a non-existent auth user. Before/after rows pasted.

## 4. Tests

New `src/lib/newPartsOrderRow.test.ts` covering `buildPartsRequestRow` as the form calls it:

- job-linked submission (`service_call_id` set, `customer_id` set)
- manual entry (`customer_id` null, snapshot name/phone/address set)
- engineer assigned → `assigned_to` set
- unassigned → `assigned_to` null
- `engineer_id` and `assigned_engineer_id` null in every case
- quantity coercion (0 / NaN / negative / float → 1 or floored) and priority passthrough

Existing `partsStatus.test.ts` / `partsRequests.test.ts` re-run to confirm no regression from the `engineerId` behaviour change.

## 5. Live trigger-fallback verification (real row, real engineer)

1. Insert a temporary `parts_requests` row for K&N: `engineer_id` null, `assigned_engineer_id` null, `assigned_to` = Karl's `engineers.id`, status `Open`, description marked `TEMP TRIGGER TEST`.
2. Update its status `Open → Ordered` as an office actor.
3. Query `notifications` for a `parts_update` row addressed to Karl's `auth_user_id`; paste the actual row.
4. Delete the temp parts row and the notification it produced; confirm counts back to baseline.

Note on actor: the trigger's office gate reads `auth.uid()`, which is null for tool-run SQL. The update will be executed through an authenticated office session (Playwright against the Parts page, same approach used for the earlier trigger checks) so `auth.uid()` and `get_user_role` resolve properly. If a browser-driven update can't be made to hit this exact row, the fallback is a temporary session-context shim — either way the pasted notification row is the evidence, not a summary.

## Flagged: the engineer's own Parts list still won't show these rows

`src/pages/engineer/EngineerParts.tsx` filters with `.or("engineer_id.eq.<uid>,assigned_engineer_id.eq.<uid>")` — it never checks `assigned_to`. So after this change the engineer gets the notification, but tapping it lands on a list that doesn't contain the row. RLS is not the blocker: `parts_requests_select` is org-wide and `parts_requests_update_own_open` already covers `assigned_to = get_engineer_id(auth.uid())`, so only the client query needs widening (resolve the viewer's `engineers.id`, add `assigned_to.eq.<engineerId>` to the `.or()`).

This is outside the four approved items, so it is not included above. Say the word and I'll fold it into the same pass — without it the new notification is a dead end.

## Technical notes

- Trigger change ships as a `CREATE OR REPLACE FUNCTION` migration; no table, column, or RLS changes.
- The `user_id` clear is a data update, not a migration.
- No changes to `insertPartsRequest`/`buildPartsRequestRow` signatures — the form already passes `engineerId` explicitly, so `undefined`-defaults-to-`loggedBy` behaviour for engineer-originated requests is untouched.
