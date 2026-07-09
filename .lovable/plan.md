# Plan: Explicit `organisations.job_reference_prefix`

Make the per-tenant job reference prefix an explicit, stable column — never derived from slug — so a future slug rename can't silently split a tenant's numbering series again.

## 1. Schema change (migration)

Add column:
```sql
ALTER TABLE public.organisations
  ADD COLUMN job_reference_prefix text;
```

No NOT NULL yet — we set it in step 2, then enforce.

## 2. Backfill (same migration)

Set each existing org's prefix explicitly:

| Org           | Prefix |
|---------------|--------|
| K&N Gas       | `KN`   |
| Dublin Gas    | `DG`   |
| Cavan Gas / Wexford / Webliveview (test tenants) | current derived value: `upper(left(regexp_replace(slug,'[^a-zA-Z0-9]','','g'),2))` — can be corrected later |
| Any other existing org | same derived fallback |

Then enforce:
```sql
ALTER TABLE public.organisations
  ALTER COLUMN job_reference_prefix SET NOT NULL;
ALTER TABLE public.organisations
  ADD CONSTRAINT job_reference_prefix_format
  CHECK (job_reference_prefix ~ '^[A-Z0-9]{2,6}$');
```

## 3. Rewrite `generate_job_reference`

- Remove all slug parsing (`regexp_replace` / `left(slug, 2)`).
- Read `organisations.job_reference_prefix` directly.
- If `NEW.organisation_id` is null OR the prefix column is null/empty → `RAISE EXCEPTION` with a clear message (`'organisations.job_reference_prefix not set for org %'`). No silent fallback to `KN-` legacy sequence for org-scoped inserts.
- Keep everything else identical: same per-org `pg_advisory_xact_lock`, same `MAX(...)+1` scoped to `organisation_id` AND matching `'^' || v_prefix || '-\d+$'`, same `LPAD(v_next::text, 3, '0')` formatting.
- Dublin Gas result: next insert uses prefix `DG`, `MAX(DG-*)+1` = **DG-388** (continues the historical series; the 13 `DU-*` rows are untouched and simply orphaned under the old prefix).

## 4. Non-goals / guarantees

- **No existing `job_reference` values are modified.** Additive/forward-only.
- No code changes required in edge functions or the frontend — the trigger is still the single source of truth; only its input changed from `slug` to a dedicated column.
- `provision-tenant` will need a follow-up (set `job_reference_prefix` on org creation) — flagged here but out of scope for this migration; new tenant creation will fail loudly until that's done, which is the intended safety behavior.

## Technical notes

- Single migration file: `ADD COLUMN` → `UPDATE` backfill → `SET NOT NULL` + `CHECK` → `CREATE OR REPLACE FUNCTION generate_job_reference`.
- Trigger binding on `service_calls` stays as-is (function replacement only).
- Legacy `job_reference_seq` fallback path is dropped for org-scoped inserts; sequence itself is left in place untouched in case any historical code references it.

Confirm to proceed and I'll switch to build mode and issue the migration.
