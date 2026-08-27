# Make customer import safe when a phone matches more than one customer

## Why

K&N and Dublin Gas both contain phone numbers shared by several customer records (7 groups, 35 rows — the largest being `+353892109224` on 14 K&N customers). The importer matches an incoming row to an existing customer on phone alone, scoped to the organisation, and today it has no defined behaviour when that match is ambiguous.

Current code path at commit time (`handleImport`, `src/pages/ImportCustomers.tsx` lines 528-542):

```
select id from customers where phone = ... and organisation_id = ...  .maybeSingle()
```

`maybeSingle()` returns an error rather than a row when several rows match, and that error is discarded — only `data` is destructured. So `existing` comes back null and the row falls through to the insert branch, **adding yet another customer on the same phone** instead of updating any of them. The preview meanwhile shows "Updates existing", which contradicts what actually happens. That mismatch is the thing to fix.

## What to change

### 1. Preview: surface ambiguity per row

Replace the existing-phone lookup so it returns enough information to distinguish one match from many, and to name the match.

- Change the batched lookup to select `id, name, address, phone` instead of `phone` only, and store a `Map<phone, {id, name, address}[]>` in place of the current `Set<string>`.
- `rowOutcome` gains a third real outcome: `new` (0 matches), `update` (exactly 1), `ambiguous` (2 or more).
- Status column badges:
  - `New` — unchanged.
  - `Updates existing` — unchanged, but the tooltip now names the customer it will update ("Will update Paul Higgins, 12 Main Street").
  - `Conflict — 3 customers share this phone` — destructive badge, tooltip listing the matching customer names.

### 2. Preview: block ambiguous rows

An ambiguous row cannot be resolved safely without the operator choosing, so it becomes a blocking error rather than a warning: the row shows `✕ Error`, is excluded from the "Import N customers" count, and is reported in the blocked tally. In-file duplicate phones stay non-blocking warnings as they are today — that behaviour is already proven and is not changing.

This is deliberately conservative: no row that touches a shared phone gets written until the underlying duplicates are cleaned up, and nothing is silently created or overwritten.

### 3. Commit: never let an ambiguous match fall through to insert

In `handleImport`, replace the `maybeSingle()` call with a plain `select` (no single-row coercion) and branch on the result count:

- 0 rows — insert, exactly as today.
- 1 row — update that customer, exactly as today.
- 2 or more rows — do not write anything. Count the row as skipped and push a `failedRows` entry: "Phone matches N existing customers — resolve the duplicates first."

Also stop discarding the query error: a genuine lookup failure should surface as a skipped row with its message, not be treated as "no existing customer" and turned into an insert.

### 4. Result summary

The post-import result already lists `failedRows`; ambiguous rows appear there with the reason above, so no new UI is needed beyond the copy.

## Out of scope

- No cleanup or merging of the existing duplicate rows in either organisation. That is a separate decision — a lot of them look like accumulated test records, and at least one (`+35314412618`, a Dublin landline) may be a legitimately shared number.
- No change to `buildRow`, header aliases, `validateImportPhone`, or the import payload.
- No change to how the app matches customers anywhere outside the importer.

## Technical notes

All changes are confined to `src/pages/ImportCustomers.tsx`:

| Location | Change |
| --- | --- |
| line 199 | `existingPhones: Set<string>` becomes `existingByPhone: Map<string, ExistingMatch[]>` |
| lines 622-653 | lookup selects `id, name, address, phone`; groups rows by trimmed phone |
| lines 656-664 | `rowOutcome` returns `new` / `update` / `ambiguous` / `unknown` |
| row validity | ambiguous rows treated as invalid for the import count and the Ready/Blocked tallies |
| lines 1078-1090 | third badge state plus match-naming tooltips |
| lines 528-542 | `maybeSingle()` replaced with count-branching; query error no longer swallowed |

## Verification

1. Upload a file containing `+353871234567` (2 K&N matches) and `+353892109224` (14 matches): both rows must show the conflict badge with the correct count, must be excluded from the import count, and the import button total must drop accordingly.
2. Upload a file with a single-match phone (Paul Higgins) and a fresh phone: still `Updates existing` and `New`, and committing still updates one and creates one — proving the safe path did not regress.
3. Force a commit containing an ambiguous row and confirm the result panel reports it as skipped with the duplicate reason, and that a database count for that phone is unchanged afterwards.
