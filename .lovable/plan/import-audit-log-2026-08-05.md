# Import audit log

Additive logging for customer imports: one record per import commit, a per-row outcome trail, an org-scoped history list on the Import page, and an all-orgs view in the Admin Panel. No change to how customer rows are read, matched, or written.

## 1. New table: `import_runs`

Columns exactly as specified: `id`, `organisation_id` (FK to organisations), `filename`, `imported_by` (the signed-in user), `created_at`, `total_rows`, `created_count`, `updated_count`, `error_count`, `row_details` (JSON array).

`row_details` holds one entry per processed row: `{ row_number, outcome, customer_id, error_message }` where `outcome` is one of `created`, `updated`, `skipped_ambiguous`, `failed`.

Access rules:
- Signed-in users can read runs belonging to their own organisation.
- Signed-in users can create a run only for their own organisation, recorded against their own user ID.
- Superadmins can read runs for every organisation.
- Nobody can edit or delete runs — the log is append-only.
- Backend/service access retained for maintenance.

## 2. Import page wiring (`src/pages/ImportCustomers.tsx`)

The existing commit loop already tracks imported / updated / skipped / failed per row. It gains a local outcome array, appended at the exact points where those counters are already incremented, and after the loop finishes one record is written to `import_runs` with the file name, the current organisation, the current user, the totals, and the collected outcomes.

Guardrails:
- The insert runs after all customer writes, so a logging failure cannot affect the import. If it fails, the import result panel still shows normally and a non-blocking notice appears.
- `buildRow`, header mapping/aliases, duplicate detection, ambiguity blocking, the payload, and the per-row read/write calls are untouched.

## 3. History views

**Import Customers page** — a "Recent imports" section below the uploader listing this organisation's last 20 runs: file name, date, who ran it, and created / updated / error counts. Each row expands to a table of `row_details` (row number, outcome, error message where present, link to the customer where a customer ID exists). Read-only.

**Admin Panel (`/admin`)** — a new "Import Runs" tab (superadmin-only route, as today) showing the same list across all organisations, with an organisation column and an organisation filter, and the same expandable row detail.

## Technical notes

- Migration creates the table, grants Data API access to `authenticated` and `service_role`, enables row-level security, and adds policies using the existing `get_my_org_id()` helper for org scoping plus the established `EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'superadmin')` bypass pattern already used on other tables. No new helper function.
- Indexes on `(organisation_id, created_at DESC)` for the list queries.
- New component `src/components/import/ImportRunHistory.tsx` (org-scoped, used on the Import page) and `src/components/admin/ImportRunsOverview.tsx` (all-orgs, used in the Admin tab). Both read-only, both resolve `imported_by` display names via `profiles`.

## Verification (real, before reporting done)

1. Commit a small test import (one new row, one existing row, one ambiguous-phone row forced through) and query the database: exactly one `import_runs` row, counts matching the on-screen result panel, `row_details` entries matching per-row outcomes and error text.
2. Confirm the same customers were created/updated as the current behaviour — no extra or missing rows.
3. Confirm the "Recent imports" section on the Import page shows the run and expands to the row detail; confirm the Admin tab shows it with the organisation column.
4. Confirm org scoping by querying the table as a K&N-scoped session versus superadmin.
5. Clean up all test customers created during verification.
