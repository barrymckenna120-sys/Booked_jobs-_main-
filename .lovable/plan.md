# BJ-NEW-X step 2+3a — apply one migration exactly as given

## What happens
1. Run the supplied SQL (lines 5–63 of the upload) byte-for-byte as a single migration. Nothing added, removed or reformatted. Stop and report on any error; no retry or patch without your approval.
2. Run the two read-only checks you listed (`pg_tables` rowsecurity, `pg_policies`) and paste the raw results.
3. Report the migration file name and the commit hash, and whether that commit is on `dev` or only on an edit branch.

No app code, Edge Function, workflow or data changes. No deploy.

## One thing to flag (not changing it)
The SQL grants `SELECT` to `authenticated` but has no `GRANT ... TO service_role`. Your comment says writes will come from the backup/restore jobs and a service-role Edge Function. The service role skips RLS, but it still needs table privileges. If this project doesn't give those by default, those writes will fail with "permission denied". I'll apply it as written. After the checks I'll also run one read-only query against `information_schema.role_table_grants` for these three tables, so you can see whether `service_role` has privileges. If it doesn't, adding the grant is a separate step for you to decide on.

## Technical notes
- The `organisations` table and `public.is_superadmin(uuid)` both exist already, so the references and policies should resolve.
- CHECK constraints are immutable regex/enum checks only, with no `now()`, so they're safe for restores.
