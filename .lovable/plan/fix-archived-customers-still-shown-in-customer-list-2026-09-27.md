# Fix: archived customers still shown in customer list

## Root cause (confirmed)
- Database read-back: Fred (`1cb5309c…`, test company "K&N gas services Ltd") has `is_archived = true`, updated 14:44 UTC. The archive worked.
- The customer list (`src/pages/Customers.tsx`, lines 170-173) loads every customer for the org with no `is_archived` filter, so archived customers still appear.

## Change (1 file)
- `src/pages/Customers.tsx`: add `.eq("is_archived", false)` to the list query. Nothing else changes: no RLS, auth or schema changes, and no archived records are touched.
- If the list has a separate archive action that updates local state, remove the archived row from state straight away after a confirmed 1-row update. I'll check this during the build and only change it if needed.

## Verification
- Archive Fred in the test company. Check he disappears straight away and is still gone after a refresh. SQL read-back to confirm the record is kept with `is_archived=true`, and that the other customers' count is unchanged.
- Restore Fred at the end so no test data is left changed.
- Mobile viewport check. Look for console errors.
- Cross-tenant: RLS on customers is unchanged, and a read-back will confirm another org's session cannot see test-org rows.
- TypeScript check and build log.
