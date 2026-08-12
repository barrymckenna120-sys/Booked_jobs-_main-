Add two nullable columns for warranty tracking and customer-visible notes

1. Run a branch check to confirm we are on `dev` before applying any migration.
2. Apply a single database migration that adds:
   - `customers.warranty_expiry_date` (date, nullable, no default)
   - `service_calls.customer_facing_notes` (text, nullable, no default)
3. No defaults, NOT NULL constraints, or changes to `under_warranty` / `warranty_years`.
4. Verify the columns exist with the expected nullable types via `information_schema.columns`.

Technical detail
- SQL: two `ALTER TABLE ... ADD COLUMN ...` statements.
- No RLS/policy changes required because no new table is created and no access rules are altered.
- No frontend or backend code changes are in scope unless the user asks for them separately.
