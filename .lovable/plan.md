
# Scope

Modify **only** `supabase/functions/tally-boiler-rebook/index.ts`. No other file, no schema change, no frontend touch.

# Preconditions verified
- `service_calls.tally_submission_id` — exists (text). No migration needed.
- `edge_function_logs` columns: `function_name, error_message, payload, created_at`. Matches the shape `tally-incoming-job` already uses.

# Changes

## 1. Phone matching — last-9-digit
- Add `last9Digits(raw)` → strips all non-digits, returns final 9 chars (or "" if <9).
- Replace the current `.eq("phone", normalisedPhone).eq("organisation_id", org)` `.maybeSingle()` with:
  - `SELECT id, name, phone, user_id FROM customers WHERE organisation_id = org`
  - In-memory `.find(c => last9Digits(c.phone) === last9Digits(normalisedPhone))`
- Org scope preserved. Normalisation of incoming phone preserved.
- Trade-off: pulls the org's customers list; DG/KN scale is fine (few thousand rows). No index change requested/needed.

## 2. Response codes
- Missing `phone`/`organisation_id` → **400** (unchanged).
- Invalid phone (fails normalise or <9 digits) → **400** (unchanged shape).
- No customer match → **422** with `{success:false, reason:"not_found"}` (body unchanged; status was 200).
- Duplicate submission (idempotency hit) → **200** with `{success:true, duplicate:true, job_id, customer_id}`.
- Success → **200** (unchanged).
- Auth fail → **401** (unchanged). DB/insert errors → **500** (unchanged).

## 3. Idempotency
- Read `tally_submission_id ?? eventId ?? id` from payload (matches `tally-incoming-job:188-191`).
- Before customer lookup: `SELECT id, customer_id FROM service_calls WHERE tally_submission_id = ? AND organisation_id = ?`. If found → return 200 duplicate.
- On insert, also write `tally_submission_id`. Handle Postgres `23505` race by re-querying and returning the winning row (same pattern as `tally-incoming-job:324-347`).

## 4. Logging
- New helper `logInvocation(supabase, payload, organisation_id, outcome)` inserts into `edge_function_logs`:
  - `function_name: "tally-boiler-rebook"`
  - `error_message: "outcome=<code> org=<uuid>"` (reuses existing column; matches how `tally-incoming-job` uses it)
  - `payload: <raw body>`
- Called on every terminal path: `bad_request_missing_fields`, `bad_request_invalid_phone`, `duplicate_submission`, `duplicate_submission_race`, `db_error:<msg>`, `not_found`, `job_insert_failed:<msg>`, `success:job=<uuid>`, `exception:<msg>`.
- Best-effort try/catch inside helper; never blocks the response.

# Explicitly NOT changing
- `organisation_id` resolution (still `body.organisation_id` — separate planned work).
- "Unmatched Rebook" `notifications` insert (unchanged copy, unchanged trigger conditions).
- Auth (shared secret), CORS, method allowlist.
- `tally-incoming-job`, `tally-webhook`, any frontend code, DB schema.

# Verification after switch to build mode
1. Show full diff.
2. Wait for user to run real rebook submissions on `kngasservices.bookedjobs.ie` AND `dublin-gas.bookedjobs.ie`.
3. On confirmation, query `edge_function_logs` + `service_calls` for both orgs to prove: submission → 200 success row, unmatched → 422 + log row + notification, replay → 200 duplicate (no second row).

Switch to build mode to apply.
