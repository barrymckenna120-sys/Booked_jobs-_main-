# BJ-NEW-X phase 1 — tenant restore DRY RUN engine

New file only: `.github/workflows/tenant-restore.yml` on `dev`. `db-backup.yml` and `restore-test.yml` untouched. Nothing is written to live; only counts are output.

## Pre-checks done (read-only, live schema)
- Every "direct" table in the brief has both `id` and `organisation_id`.
- Child link columns exist: `quote_line_items.quote_id`, `invoice_line_items.invoice_id`, `service_call_tags.service_call_id`, `customer_call_notes.customer_id`, `engineer_working_days.engineer_id`, `engineer_blocks.engineer_id`.
- `profiles` and `tenant_integrations` have `organisation_id` (report-only counts).

## How it works
1. Validate `org_id` against a UUID regex, `backup` against `^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}$` when given, and `mode == dry_run`. Fail otherwise.
2. Start the container, install the client, set up AWS, download the backup and manifest, check the sha256, create the roles, and restore. All of this matches `restore-test.yml`.
3. Fail with a clear error if `org_id` is not in the backup's `public.organisations`. Only a yes/no check runs, so no values are printed.
4. Python script (the id and hash sets stay only in the runner's memory):
   - Live access uses the secret `SUPABASE_DB_URL` passed via env as `LIVE_URL`, which is never echoed. Every live SQL batch runs as `BEGIN TRANSACTION READ ONLY; ...; COMMIT;`. It also sets `PGOPTIONS=-c default_transaction_read_only=on -c TimeZone=UTC` as a second guard. The same TimeZone is set on the backup side so timestamps hash the same way.
   - For each table, it reads the column list from `information_schema` on both sides and takes the intersection (sorted). A missing table on either side shows as `table_missing_backup` or `table_missing_live`.
   - Row hash = `md5(ROW(common cols)::text)`, keyed by `id::text`, fetched with `COPY (...) TO STDOUT`.
   - Direct filter: `organisation_id = :org`. Child filter: `fk IN (SELECT id FROM parent WHERE organisation_id = :org)`, evaluated separately in each database.
   - Outputs `in_backup`, `in_live`, `missing_from_live`, `changed` and `added_since`. Report-only tables output counts only.
   - psql stderr is captured, and any `postgres://...` / `password=` text is redacted. It reports only "query failed for <table>".
5. Writes a markdown table to `$GITHUB_STEP_SUMMARY` and `/tmp/report.json` (counts, backup filename, org_id, which the user supplied). Uploads it with `actions/upload-artifact@v4` and `retention-days: 7`.
6. Cleanup always runs: `docker rm -f pgrestore` and removes the backup, manifest, error and report files.

## Full file

```yaml
name: Tenant Restore (dry run)

on:
  workflow_dispatch:
    inputs:
      org_id:
        description: "Organisation UUID"
        required: true
        type: string
      backup:
        description: "Backup stamp e.g. 2026-09-27-1009 (blank = newest)"
        required: false
        type: string
        default: ""
      mode:
        description: "Mode"
        required: true
        type: choice
        options: [dry_run]
        default: dry_run

permissions:
  id-token: write
  contents: read

concurrency:
  group: tenant-restore
  cancel-in-progress: false

jobs:
  tenant-restore:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Validate inputs
        env:
          ORG_ID: ${{ inputs.org_id }}
          BACKUP: ${{ inputs.backup }}
          MODE: ${{ inputs.mode }}
        run: |
          set -euo pipefail
          [[ "$MODE" == "dry_run" ]] || { echo "::error::Only dry_run is supported"; exit 1; }
          [[ "$ORG_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
            || { echo "::error::org_id is not a valid UUID"; exit 1; }
          if [ -n "$BACKUP" ]; then
            [[ "$BACKUP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}$ ]] \
              || { echo "::error::backup must look like YYYY-MM-DD-HHMM"; exit 1; }
          fi
          echo "ORG_ID=${ORG_ID,,}" >> "$GITHUB_ENV"
          echo "BACKUP_STAMP=$BACKUP" >> "$GITHUB_ENV"

      - name: Start postgres 17 container with random password (never printed)
        run: |
          set -euo pipefail
          PW=$(openssl rand -hex 32)
          echo "::add-mask::$PW"
          docker run -d --name pgrestore -e POSTGRES_PASSWORD="$PW" -p 5432:5432 postgres:17
          for i in $(seq 1 30); do
            if docker exec pgrestore pg_isready -U postgres >/dev/null 2>&1; then break; fi
            if [ "$i" = "30" ]; then echo "::error::postgres did not become ready in 60s"; exit 1; fi
            sleep 2
          done
          echo "PGPASSWORD=$PW" >> "$GITHUB_ENV"
          echo "PGHOST=localhost" >> "$GITHUB_ENV"
          echo "PGUSER=postgres" >> "$GITHUB_ENV"
          echo "PGDATABASE=postgres" >> "$GITHUB_ENV"

      - name: Install postgresql-client 17
        run: |
          sudo apt-get update
          sudo apt-get install -y curl ca-certificates gnupg
          sudo install -d /usr/share/postgresql-common/pgdg
          sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
          echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
          sudo apt-get update
          sudo apt-get install -y postgresql-client-17

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::417953280285:role/bookedjobs-github-restore-test
          role-session-name: bookedjobs-tenant-restore-${{ github.run_id }}
          aws-region: eu-west-1

      - name: Download backup + manifest
        run: |
          set -euo pipefail
          B=s3://bookedjobs-db-backups-eu-west-1/daily/
          if [ -n "$BACKUP_STAMP" ]; then
            FILE="backup-$BACKUP_STAMP.sql.gz"
          else
            FILE=$(aws s3 ls "$B" | awk '{print $4}' | grep -E '^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.sql\.gz$' | sort | tail -1)
          fi
          [ -n "$FILE" ] || { echo "::error::No backup found"; exit 1; }
          STAMP=${FILE#backup-}; STAMP=${STAMP%.sql.gz}
          MAN="backup-$STAMP.manifest.json"
          if ! aws s3 cp --only-show-errors "$B$FILE" "/tmp/$FILE"; then
            echo "::error::Backup $FILE not found"; exit 1
          fi
          if ! aws s3 cp --only-show-errors "$B$MAN" "/tmp/$MAN"; then
            echo "::error::Manifest $MAN missing"; exit 1
          fi
          echo "FILE=$FILE" >> "$GITHUB_ENV"
          echo "MAN=$MAN" >> "$GITHUB_ENV"
          echo "Using $FILE"

      - name: Verify sha256
        run: |
          set -euo pipefail
          ACT=$(sha256sum "/tmp/$FILE" | awk '{print $1}')
          EXP=$(python3 -c "import json,os;print(json.load(open('/tmp/'+os.environ['MAN']))['sha256'])")
          if [ "$ACT" != "$EXP" ]; then echo "::error::sha256 mismatch"; exit 1; fi
          echo "sha256 OK"

      - name: Create Supabase roles and restore
        run: |
          set -euo pipefail
          PSQL=/usr/lib/postgresql/17/bin/psql
          for r in anon authenticated service_role supabase_admin supabase_auth_admin authenticator dashboard_user supabase_storage_admin; do
            $PSQL -qAt -c "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$r') THEN CREATE ROLE $r; END IF; END\$\$;" >/dev/null
          done
          set +e
          zcat "/tmp/$FILE" | $PSQL -q -v ON_ERROR_STOP=0 >/dev/null 2>/tmp/restore.err
          set -e
          TOTAL=$(grep -c '^psql:.*ERROR' /tmp/restore.err || true)
          OTHER=$(grep '^psql:.*ERROR' /tmp/restore.err | grep -viE 'pg_cron|pg_net|supabase_vault|pgmq|vault|cron|net\.|extensions?' | wc -l || true)
          echo "restore errors: total=$TOTAL non_platform=$OTHER"

      - name: Check org exists in backup
        run: |
          set -euo pipefail
          N=$(/usr/lib/postgresql/17/bin/psql -qAt -v org="$ORG_ID" \
              -c "SELECT count(*) FROM public.organisations WHERE id = :'org'::uuid" 2>/dev/null || echo ERR)
          if [ "$N" != "1" ]; then
            echo "::error::org_id not found in backup organisations table"; exit 1
          fi
          echo "org found in backup"

      - name: Compare backup vs live (read-only, counts only)
        env:
          LIVE_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set -euo pipefail
          [ -n "${LIVE_URL:-}" ] || { echo "::error::SUPABASE_DB_URL secret missing"; exit 1; }
          python3 - << 'PYEOF'
          import json, os, re, subprocess, sys
          PSQL = "/usr/lib/postgresql/17/bin/psql"
          ORG = os.environ["ORG_ID"]
          LIVE = os.environ["LIVE_URL"]
          BASE_ENV = dict(os.environ); BASE_ENV.pop("LIVE_URL", None)
          BASE_ENV["PGOPTIONS"] = "-c TimeZone=UTC"
          LIVE_ENV = {k: v for k, v in BASE_ENV.items() if not k.startswith("PG")}
          LIVE_ENV["PGOPTIONS"] = "-c default_transaction_read_only=on -c TimeZone=UTC"
          LIVE_ENV["PGCONNECT_TIMEOUT"] = "20"

          def redact(s):
              s = re.sub(r"postgres(ql)?://\S+", "[redacted-url]", s)
              return re.sub(r"password=\S+", "password=[redacted]", s)

          def run(side, sql):
              if side == "live":
                  args = [PSQL, LIVE, "-qAtX", "-v", "ON_ERROR_STOP=1"]; env = LIVE_ENV
                  sql = "BEGIN TRANSACTION READ ONLY;\n" + sql + "\nCOMMIT;\n"
              else:
                  args = [PSQL, "-qAtX", "-v", "ON_ERROR_STOP=1"]; env = BASE_ENV
              r = subprocess.run(args, input=sql, capture_output=True, text=True, env=env)
              if r.returncode != 0:
                  raise RuntimeError(redact(r.stderr)[:300])
              return r.stdout

          def q(s): return "'" + s.replace("'", "''") + "'"
          def ident(s): return '"' + s.replace('"', '""') + '"'

          def columns(side, table):
              out = run(side, "SELECT column_name FROM information_schema.columns "
                              f"WHERE table_schema='public' AND table_name={q(table)} ORDER BY 1;")
              return set(l for l in out.splitlines() if l)

          def org_filter(parent, fk):
              if parent is None:
                  return f"organisation_id = {q(ORG)}::uuid"
              return f"{ident(fk)} IN (SELECT id FROM public.{ident(parent)} WHERE organisation_id = {q(ORG)}::uuid)"

          def hashes(side, table, cols, where):
              expr = ", ".join(f"t.{ident(c)}" for c in cols)
              sql = (f"COPY (SELECT t.id::text || '|' || md5(ROW({expr})::text) "
                     f"FROM public.{ident(table)} t WHERE {where}) TO STDOUT;")
              d = {}
              for line in run(side, sql).splitlines():
                  if line:
                      k, h = line.rsplit("|", 1); d[k] = h
              return d

          def count(side, table, where):
              return int(run(side, f"SELECT count(*) FROM public.{ident(table)} WHERE {where};").strip().splitlines()[-1])

          DIRECT = ["customers","service_calls","quotes","invoices","job_payments","certificates",
                    "cert2_certificates","job_media","job_messages","job_engineers","job_tags",
                    "boiler_enquiries","parts_requests","parts_request_comments","products","categories",
                    "settings","brand_settings","booking_links","hazard_notifications","whatsapp_templates",
                    "customer_activity","engineers","org_price_list"]
          CHILDREN = [("quote_line_items","quotes","quote_id"),
                      ("invoice_line_items","invoices","invoice_id"),
                      ("service_call_tags","service_calls","service_call_id"),
                      ("customer_call_notes","customers","customer_id"),
                      ("engineer_working_days","engineers","engineer_id"),
                      ("engineer_blocks","engineers","engineer_id")]
          REPORT_ONLY = ["profiles","tenant_integrations"]

          try:
              run("live", "SELECT 1;")
          except RuntimeError:
              print("::error::Could not connect to live database (details redacted)"); sys.exit(1)

          results = []; errors = 0
          for table, parent, fk in [(t, None, None) for t in DIRECT] + CHILDREN:
              row = {"table": table, "kind": "direct" if parent is None else f"child of {parent}"}
              try:
                  bc, lc = columns("backup", table), columns("live", table)
                  if not bc: row["status"] = "table_missing_backup"
                  elif not lc: row["status"] = "table_missing_live"
                  else:
                      common = sorted(bc & lc)
                      if "id" not in common: raise RuntimeError("no id column")
                      where = org_filter(parent, fk)
                      b, l = hashes("backup", table, common, where), hashes("live", table, common, where)
                      bk, lk = set(b), set(l)
                      row.update(status="ok", in_backup=len(bk), in_live=len(lk),
                                 missing_from_live=len(bk - lk),
                                 changed=sum(1 for k in bk & lk if b[k] != l[k]),
                                 added_since=len(lk - bk),
                                 columns_compared=len(common),
                                 columns_backup_only=len(bc - lc), columns_live_only=len(lc - bc))
                      del b, l, bk, lk
              except RuntimeError:
                  row["status"] = "error"; errors += 1
                  print(f"::warning::query failed for {table} (details redacted)")
              results.append(row)

          report_only = []
          for table in REPORT_ONLY:
              row = {"table": table}
              try:
                  w = org_filter(None, None)
                  row.update(status="ok", in_backup=count("backup", table, w), in_live=count("live", table, w))
              except RuntimeError:
                  row["status"] = "error"; errors += 1
                  print(f"::warning::count failed for {table} (details redacted)")
              report_only.append(row)

          report = {"mode": "dry_run", "backup": os.environ["FILE"], "org_id": ORG,
                    "tables": results, "report_only": report_only, "errors": errors}
          with open("/tmp/report.json", "w") as f:
              json.dump(report, f, indent=2)

          def g(r, k): return str(r.get(k, "-"))
          with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as s:
              s.write(f"## Tenant restore DRY RUN\n\nBackup: `{os.environ['FILE']}`  \nOrg: `{ORG}`\n\n")
              s.write("| table | kind | status | in_backup | in_live | missing_from_live | changed | added_since |\n")
              s.write("|---|---|---|---|---|---|---|---|\n")
              for r in results:
                  s.write(f"| {r['table']} | {r['kind']} | {r['status']} | {g(r,'in_backup')} | {g(r,'in_live')} | "
                          f"{g(r,'missing_from_live')} | {g(r,'changed')} | {g(r,'added_since')} |\n")
              s.write("\n### Report-only (counts)\n\n| table | status | in_backup | in_live |\n|---|---|---|---|\n")
              for r in report_only:
                  s.write(f"| {r['table']} | {r['status']} | {g(r,'in_backup')} | {g(r,'in_live')} |\n")
              s.write(f"\nErrors: {errors}\n")
          sys.exit(1 if errors else 0)
          PYEOF

      - name: Upload report (counts only)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tenant-restore-report-${{ github.run_id }}
          path: /tmp/report.json
          retention-days: 7
          if-no-files-found: ignore

      - name: Clean up
        if: always()
        run: |
          docker rm -f pgrestore || true
          rm -rf /tmp/backup-*.sql.gz /tmp/backup-*.manifest.json /tmp/restore.err /tmp/report.json
```

## Notes / prerequisites
- The GitHub repo must have the Actions secret `SUPABASE_DB_URL`. It was restored earlier.
- Live access is read-only by transaction and session default. It is not a read-only database role. A dedicated read-only role would be a stronger guard for a later phase.
- Unlike the other tables, the `changed` count for `settings` and `brand_settings` may reflect normal edits.
- Verification after commit: YAML parse plus `bash -n` on the step scripts locally, and a Python syntax check on the heredoc. A real run needs your manual dispatch, suggested first against Cavan Gas.
