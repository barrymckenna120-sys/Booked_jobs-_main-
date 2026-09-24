# Rewrite the database backup workflow (single concern)

## Scope
- Rewrite `.github/workflows/db-backup.yml`.
- Delete `.github/workflows/verify-backup.yml`.
- No other files change. `backup.sh` stays as it is.
- Nothing gets triggered. You run it yourself.

## Things to know before approving
1. **New bucket.** Uploads go to `s3://bookedjobs-db-backups-eu-west-1/daily/`, not the old `bookjobs-backup-bucket`. That bucket must already exist, and the AWS key must be allowed to upload to it.
2. **psql connects to the database.** The count query runs as the dump user through the same `SUPABASE_DB_URL`, and it reads `auth.users`. The earlier successful dump used this same connection, so the read permission should be in place.
3. **With the old verify workflow gone,** you can only check the manifests in S3 from your own AWS console, because the key can only upload.

## Final `db-backup.yml`

```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * *'  # daily at 02:00 UTC
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    timeout-minutes: 30
    concurrency:
      group: db-backup
      cancel-in-progress: false
    steps:
      - name: Install postgresql-client 17 (matches Supabase server version)
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
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1

      - name: Run backup
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set -euo pipefail
          STAMP=$(date -u +%F-%H%M)
          FILE="backup-$STAMP.sql.gz"
          /usr/lib/postgresql/17/bin/pg_dump --no-owner --no-privileges "$SUPABASE_DB_URL" | gzip > "/tmp/$FILE"
          SIZE=$(stat -c%s "/tmp/$FILE")
          echo "Dump file size: $SIZE bytes"
          if [ "$SIZE" -lt 2048 ]; then
            echo "::error::Backup file is only $SIZE bytes -- pg_dump likely failed. Aborting."
            exit 1
          fi
          echo "STAMP=$STAMP" >> "$GITHUB_ENV"
          echo "FILE=$FILE" >> "$GITHUB_ENV"

      - name: Verify dump against live row counts
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set -euo pipefail
          /usr/lib/postgresql/17/bin/psql "$SUPABASE_DB_URL" -At -F$'\t' -c "select table_schema, table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint from information_schema.tables where table_type='BASE TABLE' and (table_schema='public' or (table_schema='auth' and table_name='users'))" > /tmp/live_counts.tsv
          /usr/lib/postgresql/17/bin/pg_dump --version > /tmp/pg_dump_version.txt
          python3 - << 'PYEOF'
          import gzip, hashlib, json, math, os, sys, datetime

          stamp = os.environ["STAMP"]; fname = os.environ["FILE"]
          path = f"/tmp/{fname}"

          live = {}
          with open("/tmp/live_counts.tsv") as f:
              for line in f:
                  line = line.rstrip("\n")
                  if not line:
                      continue
                  schema, table, count = line.split("\t")
                  live[f"{schema}.{table}"] = int(count)

          def norm(name):
              parts = name.split(".", 1)
              return ".".join(p.strip('"') for p in parts)

          dump = {}
          current = None
          with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
              for line in f:
                  line = line.rstrip("\n")
                  if current is None:
                      if line.startswith("COPY ") and line.endswith("FROM stdin;"):
                          name = line[5:].split(" (", 1)[0]
                          current = norm(name)
                          dump[current] = 0
                  else:
                      if line == "\\.":
                          current = None
                      else:
                          dump[current] += 1

          failures = []
          for key in sorted(live):
              d = dump.get(key); l = live[key]
              print(f"{key}\tdump={d if d is not None else 'MISSING'}\tlive={l}")
              if d is None:
                  if key.startswith("public.") or key == "auth.users":
                      failures.append(f"{key} missing from dump")
                  continue
              if d < math.floor(l * 0.98) - 5:
                  failures.append(f"{key} dump_count {d} < tolerance of live {l}")
          if dump.get("auth.users", 0) == 0:
              failures.append("auth.users missing or 0 rows")

          if failures:
              for msg in failures:
                  print(f"::error::{msg}")
              sys.exit(1)

          sha = hashlib.sha256()
          with open(path, "rb") as f:
              for chunk in iter(lambda: f.read(1 << 20), b""):
                  sha.update(chunk)
          manifest = {
              "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "file": fname,
              "bytes": os.path.getsize(path),
              "sha256": sha.hexdigest(),
              "pg_dump_version": open("/tmp/pg_dump_version.txt").read().strip(),
              "tables": {k: {"dump_count": dump.get(k), "live_count": live[k]} for k in sorted(live)},
          }
          with open(f"/tmp/backup-{stamp}.manifest.json", "w") as f:
              json.dump(manifest, f, indent=2)
          print("Verification passed")
          PYEOF

      - name: Upload to S3
        run: |
          set -euo pipefail
          aws s3 cp "/tmp/$FILE" "s3://bookedjobs-db-backups-eu-west-1/daily/$FILE"
          aws s3 cp "/tmp/backup-$STAMP.manifest.json" "s3://bookedjobs-db-backups-eu-west-1/daily/backup-$STAMP.manifest.json"
          echo "Backup complete: $FILE"
```

## Technical notes
- The upload step only runs if the steps before it succeed, which is GitHub's default behaviour. So if verification fails, nothing is uploaded.
- `STAMP` and `FILE` are passed to the later steps through `$GITHUB_ENV`. The connection string is only ever an environment variable and never gets printed.
- The parser reads the dump line by line and strips quotes from names, so tables with quoted names still match the live list. It prints only table names and the two counts.
- There are no S3 list, get or delete calls.

## After approval, I will report
The final file, proof that `verify-backup.yml` is deleted, and the `git diff` output for both files.
