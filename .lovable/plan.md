Test the cross-tenant guard on `deactivate-user` by calling it from your current preview session (assumed K&N admin/office) against Dublin Gas engineer Paul.

## Call

- Path: `/deactivate-user`
- Method: POST
- Body: `{"engineerId":"5cfe22c3-4a41-478b-9132-00d6e3b288e1"}` (Dublin Gas — Paul, auth_user_id `0a338021-…`)
- Authorization: auto-injected preview session token (your logged-in user)

Expected: `403 { "error": "Cross-tenant action not permitted" }` and no ban / no writes to Paul's engineer or profile row.

## After the call

1. Report HTTP status + raw response body.
2. Read-only verification that nothing changed:
   - `auth.users.banned_until` for `0a338021-c056-4c5c-a617-6deaa3a19e2f` still null.
   - `engineers.status` for `5cfe22c3-…` still `active`.
   - `profiles.is_active` / `deactivated_at` for `0a338021-…` unchanged.
3. If the response is anything other than 403 with that error, flag it and stop — do not retry with different inputs.

## Note

Only runs correctly if your current preview session is a K&N admin/office user (not superadmin / platform owner, which would bypass the guard). If the response comes back 200 success, first thing to check is whether the caller was actually a K&N-scoped role.
