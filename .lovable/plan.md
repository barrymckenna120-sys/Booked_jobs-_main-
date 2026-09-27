# BJ-NEW-L — Monthly restore test

New file only: `.github/workflows/restore-test.yml`. `db-backup.yml` untouched. Commit, then report file + hash. Note: the working checkout is an edit branch (`edit/edt-891cbd96…`), not `dev`; I'll report the real branch/hash honestly.

## Decisions based on the existing backup manifest
- `manifest.tables` is a dict `"schema.table" -> {dump_count, live_count}`. **Expected = `dump_count`** (rows actually in the file). `live_count` is ignored because the backup already allows 2% drift from live.
- Tables with `dump_count: null` (in live but not in the dump) are counted as failures ("missing").
- "Newest" = highest-sorting `backup-YYYY-MM-DD-HHMM.sql.gz` key (the timestamp format sorts correctly). Manifest = same stamp `.manifest.json`; fail if missing.

## IAM prerequisite (you, in AWS)
Role `bookedjobs-github-restore-test` must trust GitHub OIDC for this repo and allow `s3:ListBucket` (prefix `daily/`) + `s3:GetObject` on `daily/*`. Nothing else. If the role doesn't exist yet the run fails at step 2.

## Full file

```yaml
name: Database Restore Test

on:
  schedule:
    - cron: '0 3 1 * *'  # 1st of month, 03:00 UTC
  workflow_dispatch: {}

permissions:
  id-token: write
  contents: read

jobs:
  restore-test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    concurrency:
      group: db-restore-test
      cancel-in-progress: false
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD_FILE: /run/pgpass/pw
        ports:
          - 5432:5432
        volumes:
          - /tmp/pgpass:/run/pgpass
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 30
    steps:
      # NOTE: service containers start before steps, so the random password
      # is created by a pre-step-equivalent: see "Set random password" below,
      # which resets it via local trust inside the container.
      - name: Set random password (never printed)
        run: |
          set -euo pipefail
          PW=$(openssl rand -hex 32)
          echo "::add-mask::$PW"
          CID=$(docker ps --filter "ancestor=postgres:17" --format '{{.ID}}' | head -1)
          docker exec "$CID" psql -U postgres -qc "ALTER USER postgres PASSWORD '$PW'" >/dev/null
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
          role-session-name: bookedjobs-db-restore-test-${{ github.run_id }}
          aws-region: eu-west-1

      - name: Download newest backup + manifest
        run: |
          set -euo pipefail
          B=s3://bookedjobs-db-backups-eu-west-1/daily/
          FILE=$(aws s3 ls "$B" | awk '{print $4}' | grep -E '^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.sql\.gz$' | sort | tail -1)
          [ -n "$FILE" ] || { echo "::error::No backup found"; exit 1; }
          STAMP=${FILE#backup-}; STAMP=${STAMP%.sql.gz}
          MAN="backup-$STAMP.manifest.json"
          aws s3 cp --only-show-errors "$B$FILE" "/tmp/$FILE"
          aws s3 cp --only-show-errors "$B$MAN" "/tmp/$MAN" || { echo "::error::Manifest $MAN missing"; exit 1; }
          echo "FILE=$FILE" >> "$GITHUB_ENV"
          echo "MAN=$MAN" >> "$GITHUB_ENV"
          echo "Using $FILE"

      - name: Verify sha256
        run: |
          set -euo pipefail
          ACT=$(sha256sum "/tmp/$FILE" | awk '{print $1}')
          EXP=$(python3 -c "import json;print(json.load(open('/tmp/$MAN'))['sha256'])")
          if [ "$ACT" != "$EXP" ]; then echo "::error::sha256 mismatch"; exit 1; fi
          echo "sha256 OK"

      - name: Create Supabase roles and restore
        run: |
          set -euo pipefail
          PSQL=/usr/lib/postgresql/17/bin/psql
          for r in anon authenticated service_role supabase_admin supabase_auth_admin authenticator dashboard_user supabase_storage_admin; do
            $PSQL -qAt -c "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$r') THEN CREATE ROLE $r; END IF; END\$\$;" >/dev/null
          done
          # Errors expected from missing platform extensions/schemas
          # (pg_cron, pg_net, supabase_vault, pgmq). Stderr goes to a file,
          # only an error COUNT is printed; row data never reaches the log.
          set +e
          zcat "/tmp/$FILE" | $PSQL -q -v ON_ERROR_STOP=0 >/dev/null 2>/tmp/restore.err
          set -e
          TOTAL=$(grep -c '^psql:.*ERROR' /tmp/restore.err || true)
          OTHER=$(grep '^psql:.*ERROR' /tmp/restore.err | grep -viE 'pg_cron|pg_net|supabase_vault|pgmq|vault|cron|net\.|extensions?' | wc -l || true)
          echo "restore errors: total=$TOTAL non_platform=$OTHER"

      - name: Compare row counts
        run: |
          set -euo pipefail
          python3 - << 'PYEOF'
          import json, os, subprocess, sys
          man = json.load(open(f"/tmp/{os.environ['MAN']}"))
          psql = "/usr/lib/postgresql/17/bin/psql"
          fails = 0; ok = 0; lines = []
          for key in sorted(man["tables"]):
              exp = man["tables"][key].get("dump_count")
              schema, table = key.split(".", 1)
              q = 'SELECT count(*) FROM "%s"."%s"' % (schema.replace('"','""'), table.replace('"','""'))
              r = subprocess.run([psql, "-qAt", "-c", q], capture_output=True, text=True)
              got = r.stdout.strip() if r.returncode == 0 else "MISSING"
              line = f"{key} restored={got} expected={exp if exp is not None else 'MISSING'}"
              print(line); lines.append(line)
              if exp is None or got == "MISSING" or int(got) != int(exp):
                  fails += 1
              else:
                  ok += 1
          status = "PASS" if fails == 0 else "FAIL"
          with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as s:
              s.write(f"## Restore test: {status}\n\nBackup: `{os.environ['FILE']}`\n\n")
              s.write(f"Tables matched: {ok} / {ok + fails}, mismatched or missing: {fails}\n\n")
              if fails:
                  s.write("```\n" + "\n".join(l for l in lines if "MISSING" in l or l.split(' restored=')[1].split(' ')[0] != l.split('expected=')[1]) + "\n```\n")
          sys.exit(1 if fails else 0)
          PYEOF

      - name: Clean up /tmp
        if: always()
        run: rm -rf /tmp/backup-*.sql.gz /tmp/backup-*.manifest.json /tmp/restore.err /tmp/pgpass
```

## Technical notes
- Password: generated in-job with `openssl rand`, masked via `::add-mask::`, only passed through `$GITHUB_ENV`. Because GitHub starts service containers before any step, the container boots from an empty password file and the first step sets the random password inside the container. (Alternative if you prefer: run postgres via `docker run` in a step instead of `services:` — simpler password handling, same result. Tell me if you want that instead.)
- psql stdout is sent to `/dev/null` and stderr to a file, so no row data is printed; only error counts.
- Non-platform restore errors are reported as a count but do not fail the job; the row-count comparison is the pass/fail gate, as specified.
- No changes to `db-backup.yml`, secrets or any other file.
