# Log ambiguous-phone rows, then run verification

## Finding 3 fix

Ambiguous-phone rows are currently dropped before the commit loop, so they never reach the audit log. `handleImport` (ImportCustomers.tsx line 526) filters to `decoratedRows.filter(r => r.isValid)`, and the ambiguous decoration sets `isValid: false` (line 812). That makes the `skipped_ambiguous` branch inside the loop (lines 555-570) unreachable in practice — it only fires if a phone becomes ambiguous between preview and commit.

Change: split the rows instead of filtering them away.

- Partition `decoratedRows` into ambiguous rows (`ambiguousRowNums.has(r.rowNum)`) and committable rows (`r.isValid`).
- Before the loop, push one `skipped_ambiguous` entry per ambiguous row into `rowDetails`, increment `skipped`, and add it to `failedRows` using the same message the preview shows.
- Set `total_rows` to committable + ambiguous instead of `validRows.length`.
- Leave the commit loop untouched, including its existing `skipped_ambiguous` branch as the safety net for rows that turn ambiguous mid-commit.

Ambiguous rows are still never inserted or updated — they never enter the loop. The only change is what gets logged.

## What this changes downstream

Ambiguous rows now count toward `error_count`, so an import whose only problem is conflict rows will send the import-error email that previously stayed silent. That matches the intent of the alert, and the plan verifies it.

## Other silently excluded rows — flag only, no fix

Rows that fail `buildRow` validation (missing required fields, bad dates, bad GPRN format) also set `isValid: false` and are excluded from `total_rows` and `row_details` by the same filter. They are visible in the preview as blocking errors, so nothing is hidden from the operator at import time, but the audit log has no record of them.

Not touching those in this change. If you want them logged, they need a `validation_failed` outcome added to `ImportRunRowDetail` plus label and UI handling, which is a wider change than this fix.

## Verification

Step 1 — clean source: confirm no stale identifiers remain in the importer, and confirm the file typechecks.

Then three live test cases against K&N Gas Services, using disposable customers created and removed within the run:

1. **New phone** — expect `created`, `created_count` 1, no error email.
2. **Single existing match** — expect `updated`, `updated_count` 1, no error email.
3. **Conflict phone** (two existing customers sharing one number) — expect the row blocked in the preview with the Conflict badge, no write to `customers`, and a `row_details` entry with `outcome: "skipped_ambiguous"`, counted in both `total_rows` and `error_count`, with the import-error email firing once.

Report the real `import_runs` row for each case rather than a summary, and confirm the customers table is unchanged for case 3.

## Cleanup

Delete every test customer and every test `import_runs` row created during verification, then re-query both tables to confirm nothing is left behind.

## Technical notes

- Only `src/pages/ImportCustomers.tsx` changes. No schema change: `skipped_ambiguous` already exists in `ImportRunRowDetail` and `OUTCOME_LABELS`.
- No edge function change; `notify-import-errors` already re-reads the run server-side and keys off `error_count`.
- Case 3 requires two customers sharing a phone inside one organisation, created as test data and removed afterwards.
