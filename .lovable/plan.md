# WhatsApp test mode: Stage 1 re-check and report

## Current state (checked just now)
Stage 1 was applied before this approval. Nothing new needs to be built. A read-only check shows:
- `organisations.whatsapp_test_mode` is a boolean with default true
- `organisation_whatsapp_allowed_numbers` has these columns: id uuid, organisation_id uuid, phone text, added_by uuid, created_at timestamptz. It has 0 rows and one superadmin-only access rule
- c0aa41ac = false, 8c37827f = false, Dublin Gas = false. No company is in test mode

## Steps (no data changes)
1. Run the three permission checks again as simulated users inside a transaction that is rolled back:
   - a normal tenant owner tries to change test mode (should be blocked)
   - a normal tenant owner tries to read or add allowed numbers (should be blocked)
   - a superadmin changes test mode (should work, then be rolled back)
2. Confirm a new company gets TEST by default by inserting one inside a rolled-back transaction.
3. Read the three companies' current values again by ID and confirm that 0 companies are in test mode.
4. Check the message logs to confirm no WhatsApp sends came from this work.
5. Report every item on your list, including which migration files changed. Then stop.

## Out of scope
- Switching c0aa41ac into test mode
- Any WhatsApp send
- Stage 2
- Renaming or labelling either K&N company

## Technical details
Every test runs in a BEGIN…ROLLBACK transaction and simulates users with `set local role authenticated` plus JWT claims. No migrations are run and no data is written.
