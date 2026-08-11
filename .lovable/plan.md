# New Order form on the office Parts Requests screen

Adds a "New Order" button to the office Parts screen so office/admin can log a phoned-in part request, with or without a linked job, optionally assigned to an engineer.

## Scope

- Touched: `src/pages/Parts.tsx` (header button + sheet state), one new component `src/components/parts/NewPartsOrderSheet.tsx`, and a small insert helper in `src/lib/partsRequests.ts`.
- Not touched: engineer-facing components, `parts_requests` structure, RLS policies, the legacy `assigned_to` column, no cost/supplier/price fields.

## Form behaviour

Job (optional)
- Search input matching `job_reference` (digit-tolerant, reusing `extractRefDigits`) or customer name.
- Restricted to `service_calls` in the current organisation with status not `Completed` / `Cancelled`.
- Selecting a job auto-fills `customer_name`, `customer_address`, `customer_eircode`, `customer_phone` from the linked customer, and `boiler_brand_model` from the job/customer boiler brand + model. Sets `service_call_id`.
- "Clear job" returns the form to manual mode.

No job selected
- Manual optional inputs: customer name, address, eircode, phone. `boiler_brand_model` left blank, `service_call_id` stays null.

Assign to engineer (optional)
- Reuses the existing engineer list query used elsewhere for assignment (`engineers` where `status = 'active'`, ordered by name), reading `auth_user_id`.
- Verified by direct query, not assumed: every active engineer with a populated `auth_user_id` has a matching `profiles.user_id` (`matches = true`) — **except one**: `engineers.id 5473f748-dd80-4a11-8f03-bfb5c2faa02e` ("nicole  enginner", officeapp@gmail.com, org `8c37827f`), which has `auth_user_id b646f6de-843e-4d3f-ab1d-245573f38d94` but no `profiles` row at all. Reported for a source-data fix; not silently ignored.
- Because `assigned_engineer_id` is FK'd to `profiles(user_id)`, the picker resolves its options by joining `engineers` to `profiles` on `auth_user_id = profiles.user_id` and only offers engineers with a real profile row. This makes an FK failure structurally impossible while that one record stays inconsistent, and it needs no schema or policy change.
- Engineers with no auth account (A. Kelly, barry manager, C. O'Connor, Mary Byrne — invited, never signed up) and the inconsistent record are shown greyed out with "no app account", so office can see why they aren't assignable rather than wondering where they went.
- Selected engineer's `auth_user_id` (= their `profiles.user_id`) is written to `assigned_engineer_id`. Blank leaves the request unassigned (visible to office, absent from any engineer's My Parts list).

Part fields
- `description` (required, submit blocked while empty), `quantity` (default 1, min 1), `priority` select with lowercase values `urgent` / `normal` / `low` (default `normal`), `notes` (optional).

## Insert

One `parts_requests` row:
- `organisation_id` from the signed-in user's own profile lookup (`useOrgId`), never from a client-editable field; RLS also constrains it.
- `created_by` and `logged_by` = current user's `profiles.user_id`; `logged_by_name` = display name.
- `engineer_id` = null always (reserved for engineer-originated requests).
- `assigned_engineer_id` = selected engineer or null.
- `status` left to the `Open` default, plus description/quantity/priority/notes and the customer snapshot fields.
- On success: toast, close sheet, refetch the list.

## Verification (run after building, output pasted back)

1. Create three orders through the UI: one with a job linked, one manual-entry with no job, one assigned to a test engineer.
2. Query those rows showing `service_call_id`, customer snapshot fields, `assigned_engineer_id`, `engineer_id`, `created_by`, `logged_by`, `status`, `organisation_id`.
3. Delete the three test rows, then re-count `parts_requests` to show the pre-existing rows are untouched.
