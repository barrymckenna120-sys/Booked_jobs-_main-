# BJ-0097 Step 2 — Nightly offsite backup to your own S3

Confirmed from Step 1: no backup/dump/export code, no S3 code, no AWS secrets, no backup cron. Postgres 17.6. `pg_dump` cannot run inside an Edge Function (Deno runtime, no shell, no Postgres binaries), so the runner is external — a scheduled GitHub Action.

## Credential blocker to resolve first

`pg_dump` needs a direct Postgres connection string (host, port, user, **password**). On Lovable Cloud the database password and service-role key are not available to me and cannot be fetched — you must obtain a database connection string yourself before the Action can work.

Two ways forward:

1. **You supply a Postgres connection string** (a read-capable role is enough for a data dump). This is the only route that gives a true `pg_dump` backup. If you cannot obtain one, option 2 is the fallback.
2. **Fallback if no connection string exists:** the Action authenticates as a superadmin user against the app's Data API and writes per-table JSON/CSV instead of a `.dump`. Consistent-enough for record keeping, but not a restorable native dump.

The plan below assumes option 1, and notes where option 2 differs.

## What gets built

Everything lives in the GitHub repository this project syncs to — no app code, no new Edge Function, no new pg_cron job.

1. **`.github/workflows/backup.yml`** — scheduled `cron: '0 2 * * *'` (03:00 Europe/Dublin in summer, 02:00 in winter), plus `workflow_dispatch` for manual runs. Uses `postgres:17` container tooling so `pg_dump` major version matches the server.
2. **`scripts/backup/db-dump.sh`** — full-cluster logical dump of all tenants together:
   - `pg_dump --format=custom --no-owner --no-privileges` → `all-tenants-<UTC date>.dump`
   - plus a plain-SQL schema-only file so schema drift is reviewable in a diff.
3. **`scripts/backup/per-tenant.sh`** — one export per organisation, for tenant-level restore and GDPR requests:
   - reads the organisation list, then for each org id runs `COPY (SELECT … WHERE organisation_id = $1) TO STDOUT WITH CSV HEADER` over the 16 tenant-scoped tables, gzipped into `tenant-<slug>/<table>.csv.gz`.
   - shared/global tables (e.g. `boiler_brands`) are dumped once at top level, not duplicated per tenant.
4. **`scripts/backup/storage-files.sh`** — mirrors Supabase Storage buckets (job media, certificate PDFs) to S3. Notes in the script that Cloudinary-hosted assets cannot be pulled — no admin credential exists for them (same limitation already documented in `reset-org-data`).
5. **S3 upload + retention** — `aws s3 cp` under a dated prefix `s3://<bucket>/bookedjobs/<YYYY>/<MM>/<YYYY-MM-DD>/`. Retention is enforced by an S3 lifecycle rule you set on the bucket (30 daily / 12 monthly suggested), not by the script deleting objects.
6. **Failure alerting** — the workflow fails loudly on any non-zero step, and posts a failure notification so a silent broken backup is impossible. A backup that never reports is the classic failure mode; the workflow also writes a `MANIFEST.txt` with row counts per table so you can verify a run actually captured data.

## What you need to do (outside Lovable)

1. Create the S3 bucket in your AWS account (private, versioning on, default encryption, lifecycle rule for retention).
2. Create an IAM user/role limited to `s3:PutObject`/`GetObject`/`ListBucket` on that bucket only.
3. Add GitHub **repository secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, and `BACKUP_DATABASE_URL` (option 1) or the superadmin credentials (option 2).

These are GitHub Action secrets, not project secrets — nothing AWS-related needs to be stored in the app's secret store, so the app never holds AWS credentials.

## Verification

- Trigger the workflow manually and confirm objects land under the dated S3 prefix.
- Confirm the `.dump` restores into a scratch Postgres 17 database and that row counts match `MANIFEST.txt`.
- Confirm per-tenant CSVs contain only that organisation's rows (spot-check K&N vs Dublin Gas customer counts).
- Confirm a deliberately broken credential makes the workflow fail visibly rather than upload an empty file.
- Confirm no app behaviour, no Edge Function, and no existing cron job changed.

## Out of scope

Restore automation, Cloudinary asset backup, and any change to the 7 existing pg_cron jobs.
