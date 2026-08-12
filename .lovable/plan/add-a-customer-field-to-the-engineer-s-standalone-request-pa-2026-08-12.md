# Add a customer field to the engineer's standalone Request Part flow

## Why
`parts_requests` has a BEFORE INSERT/UPDATE trigger (`validate_parts_request_customer`) that rejects any row with no `customer_id` and a blank `customer_name`. The engineer's new job-less "+ Request Part" flow sends both as null, so it fails. The office New Order form already blocks submission until a customer is picked or typed, which is why it never hits this.

## Changes

### 1. `src/components/engineer/PartsNeededSheet.tsx`
Add an **optional** customer step, off by default so existing job-card usage is byte-for-byte unchanged in behaviour:
- New optional props: `requireCustomer?: boolean` and a widened `onConfirm(part, customer?)` where `customer` is `{ customerId: string | null; customerName: string | null }`.
- When `requireCustomer` is true, render above the part description:
  - a debounced search input over `customers` (name or phone, scoped to the engineer's `organisation_id`, limit 8) — same query shape as `NewPartsOrderSheet.tsx:132-143`;
  - the selected customer as a chip with a "Change" action;
  - a "Customer not in the system — enter name manually" toggle that shows a single free-text name input.
- `canConfirm` additionally requires a selected customer or a non-blank typed name when `requireCustomer` is true.
- The org id needed for the search comes in as a new optional `organisationId` prop.

### 2. `src/pages/engineer/EngineerParts.tsx`
- Pass `requireCustomer` and `organisationId={engineer.organisation_id}` to the sheet.
- In the confirm handler, forward the customer through the existing `insertPartsRequest` call: `customerId` from the picked row, or `customerName` from the typed value (never both — the row builder already nulls the name when an id is present).
- Everything else stays: `serviceCallId: null`, `loggedBy`, `loggedByName`, reload key bump, success/error toasts.

### 3. No other changes
No schema, RLS, or trigger changes. Job-card usage of the sheet is untouched (props are optional).

## Verification
- Unit test for the row builder with the two engineer cases (picked customer → `customer_id` set, `customer_name` null; typed name → name set, id null), asserting the trigger's precondition is satisfied.
- Manual: `/engineer/parts` → "+ Request Part" → pick a customer, submit, row appears; then repeat with a manual name. Confirm the job-card "Parts Needed" sheet still shows no customer field.
- Confirm no console errors and mobile layout still fits.
