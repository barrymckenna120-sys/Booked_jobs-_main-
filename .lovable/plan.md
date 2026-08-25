# Fix: "Delete All Test Data" in Settings → Data & Security

## Root cause

The button was never wired to anything. In `src/components/settings/SecurityTab.tsx` the click handler only shows a toast reading "Test data deletion is not yet available." There is no backend function, no deletion logic, and no confirmation dialog. Nothing is broken in RLS or the database — the feature simply does not exist.

There is also no way to tell test data apart from real data: no `is_test`, `is_demo`, or similar column exists on any table.

## Decisions made (no flag exists, so this is an account reset)

- **Scope:** wipe all operational data belonging to the caller's own organisation — jobs, customers, quotes, invoices, payments, certificates, media, messages, notifications, parts requests, activity and audit rows.
- **Kept:** the organisation itself, all user logins, team/engineer records, business settings, branding, price lists, products, categories, boiler brands and integrations. The account stays usable, just empty.
- **Never touched:** any row belonging to another organisation.
- **Permission:** organisation admin or superadmin only. Office and engineer roles get 403.
- **Confirmation:** a dialog listing exactly what will be deleted, requiring the user to type their organisation name before the destructive button enables.

## What will be built

1. **New backend function `reset-org-data`**
   - Requires a signed-in caller; resolves the caller's role and organisation the same way the existing `reset-auth-block` guard does (engineers row first, then profiles).
   - Rejects anything that is not admin/superadmin with 403.
   - Non-superadmins may only target their own organisation; superadmins may pass an explicit organisation id.
   - Deletes in child-to-parent order so no orphans and no foreign-key failures are left behind, with every statement filtered by organisation.
   - Handles `ON DELETE RESTRICT` links (notably job payments) by deleting the dependent rows before their parent.
   - Returns a per-table deleted-row count so the UI can report a real result.
2. **Confirmation dialog + wiring in `SecurityTab.tsx`**
   - Replaces the stub handler with a destructive confirmation dialog (organisation-name typed confirmation).
   - Calls the new function, shows a loading state, then a success toast with the row counts or an error toast with the real backend message.
   - On success, reloads the app so every cached list shows the clean state.
3. **Copy update** so the helper text describes an account data reset rather than "rows marked as test data".

## Technical notes

- Deletion order: job payments and checkout attempts → invoice line items → invoices → quote line items → quotes → job media, job messages, job tags, service call tags, certificates, hazard notifications → parts request comments → parts requests → transactions → service calls → customer activity, customer call notes → customers → message log, whatsapp messages, conversations, notifications, audit and tenant activity rows.
- Every delete is scoped by `organisation_id`, or by a parent id already filtered to that organisation where the child table has no `organisation_id` column.
- The function uses the service role internally, so the tenant guard in code is the only thing preventing cross-tenant deletion; it is checked before any delete runs.
- Storage objects for deleted job media are removed by path prefix where the bucket layout allows it; any that cannot be resolved are reported in the response rather than silently skipped.
- Nothing in booking, payment or quote business logic changes — only deletion.

## Verification

- Confirm the dialog will not enable until the organisation name matches.
- Run the reset on a test organisation, then verify counts for that organisation are zero and another organisation's counts are unchanged.
- Confirm the account can still sign in and that settings, team and branding survive.
