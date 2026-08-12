# Fix engineer identity links, then build the office New Order form

The pre-build check failed, so this plan does the data repair first and only then builds the New Order form. Every affected engineer record carries real jobs, so nothing is deleted — the repairs relink or retire identities and leave job history untouched.

## What the query proved

12 active engineer records. 6 clean. 6 problems, in three groups:

- **No login at all** (`auth_user_id IS NULL`): A. Kelly (8 jobs), C. O'Connor (2 jobs), Mary Byrne (3 jobs), barry manager (12 jobs) — all K&N. These are real people on the schedule with no app account.
- **Points at an auth user that does not exist**: "nicole  enginner" (`officeapp@gmail.com`, 6 jobs) has `auth_user_id = b646f6de…`, but there is no row for that id in the auth users table and no profile. It is a dangling reference, not a missing profile.
- **Cross-tenant links**:
  - K&N record "Paul" (`barrytest2024@gmail.com`, 7 jobs) links to auth user `2efeab15…`, whose profile is "barrytest", an **admin in Cavan Gas**. A K&N engineer row is wired to a Cavan Gas identity.
  - Dublin Gas record "Paul" (`btestjuly2025@gmail.com`, 23 jobs) has the correct `auth_user_id` (profile "fred", Dublin Gas) but its legacy `user_id` column holds `574c0743…`, which is **nicole's K&N id**.

You confirmed: barry manager is the K&N owner, and Paul is a Dublin Gas engineer — so the K&N "Paul" record is the stray one.

## Stage 1 — repair the identity data

Three targeted data changes, no schema change:

1. **Clear the dangling auth link** on "nicole  enginner": set `auth_user_id` to empty. The record stays active and assignable, its 6 jobs are untouched, and it becomes a no-notify record (accurate — that email has no login).
2. **Break the cross-tenant link on K&N "Paul"**: clear its `auth_user_id` so a K&N record no longer resolves to a Cavan Gas admin. Its 7 historical jobs stay exactly as they are. Because Paul is a Dublin Gas engineer, this record is also set to inactive so it stops appearing in pickers — history remains visible on the old jobs.
3. **Fix the legacy column on Dublin Gas "Paul"**: set `user_id` to match its own `auth_user_id`, removing the pointer at nicole's K&N id.

Then re-run the original check and paste the output. Expected after repair: no record links to a non-existent auth user, no record links across organisations, and every record that *does* have a link shows `matches = true`. The four no-login K&N records will still show empty links — that is correct and is what Stage 2 flags in the UI.

## Stage 2 — the New Order form

A "New Order" button on the office Parts page opens a sheet for phoned-in parts orders that may have no job attached.

Fields:
- Part description (required), quantity, priority (urgent / normal / low)
- Customer: pick an existing customer, or type name / address / phone when there is no record yet
- Optional job link
- Assign to engineer (optional)
- Notes

**Engineer picker behaviour (your decision):** every active engineer in the organisation is listed and assignable. Engineers with no working app account show a muted "no app account — won't be notified" hint beside the name, and selecting one shows the same note under the field. Nothing is hidden, nothing silently fails.

On save the order is created as an Open request and appears in the existing Open section of the Parts page. The status flow, icons, notifications and cancelled section all stay exactly as they are.

## Technical notes

- Stage 1 is three data updates against `engineers` (`auth_user_id`, `status`, `user_id`) — no migration, no RLS change, no schema change.
- Stage 2 reuses `insertPartsRequest` / `buildPartsRequestRow` from `src/lib/partsRequests.ts` unchanged; job-less orders already work through the nullable `service_call_id` and the customer snapshot columns.
- Engineer options come from `engineers` scoped to the caller's organisation; the no-notify flag is derived from a missing `auth_user_id`, computed in a small pure helper so it can be unit tested.
- `engineer_id` on the new request is resolved from the selected engineer's `auth_user_id` and left empty when there is none — matching the existing office path on Job Detail, so the notification trigger never misfires.
- New files: an office parts order sheet component plus a helper and its unit tests. Changed: `src/pages/Parts.tsx` (button + sheet wiring only).
- Tests: unit coverage for the no-notify derivation, the required-field guard, the customer-record vs typed-in-details branch, and that a job-less order builds a valid row.
