# BJ-NEW-L — Capture pg_dump errors as a readable run annotation

## Scope
- One file: `.github/workflows/db-backup.yml`.
- One step: "Run backup". No other steps, triggers, permissions or role ARN change.
- Diagnostics only — no behavior change on success.

## Current state (verified)
- Current checkout is edit branch `edit/edt-de4f84b2-...`, which is even with `origin/dev` (the role-ARN fix `969e8d217` is on dev). The change will be committed on dev as requested.

## Change
The "Run backup" step currently pipes pg_dump straight into gzip. If pg_dump fails, the error is buried in the runner log. Change it to:

```yaml
      - name: Run backup
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set -euo pipefail
          STAMP=$(date -u +%F-%H%M)
          FILE="backup-$STAMP.sql.gz"
          if ! /usr/lib/postgresql/17/bin/pg_dump --no-owner --no-privileges "$SUPABASE_DB_URL" 2>/tmp/pg_dump.err | gzip > "/tmp/$FILE"; then
            sed -E -e 's#(postgres(ql)?://)[^[:space:]]*#(postgres URL REDACTED)#g' -e 's#(password=)[^&[:space:]]*#\1[REDACTED]#g' /tmp/pg_dump.err > /tmp/pg_dump.redacted
            echo "::error title=pg_dump failed::$(head -10 /tmp/pg_dump.redacted | tr '\n' ' ' | sed 's/|/\\|/g; s/  */ | /g; s/^ //; s/ $//')"
            exit 1
          fi
          SIZE=$(stat -c%s "/tmp/$FILE")
          ... (rest unchanged)
```

Rules honoured:
1. pg_dump stderr → `/tmp/pg_dump.err`; gzip pipe, `set -euo pipefail`, size check and all later steps untouched.
2. On failure: redact any `postgres://` / `postgresql://` URL (whole URL, not just credentials) and any `password=...` value, print the first 10 redacted lines joined with ` | ` as ONE `::error title=pg_dump failed::` annotation, then exit 1. `|` in the message is escaped so GitHub's annotation parser doesn't break it.
3. `SUPABASE_DB_URL` is never echoed; only the redacted error file is read. If pg_dump fails before producing a dump file, no upload happens (later steps don't run).

## Report after build
- Diff of the file.
- Commit hash on dev.
