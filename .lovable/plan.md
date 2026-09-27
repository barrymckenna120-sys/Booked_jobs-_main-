# BJ-NEW-X phase 1 — connection diagnostic (tenant-restore.yml only)

## What to change

In `.github/workflows/tenant-restore.yml`, inside the **"Compare backup vs live"** step,
insert a diagnostic block **before** the existing `python3 - << 'PYEOF'` heredoc
(immediately after the `LIVE_URL` secret-presence check, around line 144):

```yaml
        python3 - << 'EOF'
        import os, urllib.parse as u
        p = u.urlsplit(os.environ["LIVE_URL"])
        print("scheme:", p.scheme)
        print("user:", (p.username or "")[:12] + "…", "has_dot:", "." in (p.username or ""))
        print("host:", p.hostname, "port:", p.port, "db:", p.path)
        print("query keys:", sorted(u.parse_qs(p.query).keys()))
        print("password present:", bool(p.password))
        EOF
        /usr/lib/postgresql/17/bin/psql "$LIVE_URL" -qAtX -c "select 1" \
          && echo "bash psql connect: OK" || echo "bash psql connect: FAILED"
```

Notes:
- The step already sets `env: LIVE_URL: ${{ secrets.SUPABASE_DB_URL }}`, so both the
  Python heredoc and bash can read it without new plumbing.
- Only non-secret metadata is printed: scheme, truncated username + a boolean for the
  dot (detects a `user.domain` pooler username vs plain `postgres`), host, port, db path,
  query keys, and a boolean for password presence. Never the password or the full URL.
- The bash `psql "$LIVE_URL" -c "select 1"` mirrors a direct connect (same as db-backup.yml
  style, URL as positional argument) to see whether bash connects even when the Python
  block's connection check failed before.

## Explicitly unchanged

- The Python compare block itself, the earlier redacted-connection-error change
  (`-d LIVE` + redacted error text), all other steps, `db-backup.yml`, `restore-test.yml`.
- No Edge Functions, no DB changes, no deploys.

## Commit

Single commit to `dev` containing only this insertion; report the commit hash and the
resulting diff (the file's current edit-branch state and dev tracking will be re-checked
at commit time).
