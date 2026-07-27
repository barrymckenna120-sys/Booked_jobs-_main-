## Test unblock-user cross-tenant guard

Two curl invocations against `/unblock-user` from the current preview session (K&N admin/office), plus a read-only DB check.

### Test 1 — cross-tenant (expect 403)
- POST `/unblock-user` with body `{ "engineerId": "5cfe22c3-4a41-478b-9132-00d6e3b288e1" }` (Paul, Dublin Gas)
- Expected: HTTP 403, `{ "error": "Cross-tenant action not permitted" }`
- Report exact status + body

### Test 2 — same-tenant (expect non-403)
- POST `/unblock-user` with body `{ "engineerId": "a6f0f56b-c2a3-4517-9856-f42614a7560d" }` (barry manager, K&N, no auth_user_id)
- Expected: passes guard, proceeds to normal unblock flow (success or downstream error — not 403)
- Report exact status + body

### Post-test verification (read-only)
Query the DB for Paul's target rows to confirm Test 1 made zero changes:
- `engineers` row `5cfe22c3-4a41-478b-9132-00d6e3b288e1`: `status`, `is_available`, `blocked_reason`
- `profiles` row for auth_user_id `0a338021-c056-4c5c-a617-6deaa3a19e2f`: `is_active`, `deactivated_at`, `deactivated_by`
- `auth.users` row for `0a338021-c056-4c5c-a617-6deaa3a19e2f`: `banned_until` (compare vs pre-test value `2026-07-13 13:18:17.030636+00`)

### Deliverable
Report both HTTP statuses + response bodies, plus the three verification row snapshots confirming no cross-tenant mutation occurred.

No code changes.