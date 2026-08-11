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
- Reuses the existing engineer list query used elsewhere for assignment (`engineers` where `status = 'active'`, ordered by name), reading `auth_user_id` — which is the same auth user id stored in `profiles.user_id`.
- Selected engineer's `auth_user_id` is written to `assigned_engineer_id`. Blank leaves the request unassigned (visible to office, absent from any engineer's My Parts list).
- Engineers with no linked auth account are shown as disabled, since they have no `profiles.user_id` to assign to.

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
