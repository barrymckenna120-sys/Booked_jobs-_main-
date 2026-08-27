# BJ-0059: send-payment-link tenant/org verification

## Goal
Lock down `send-payment-link` so it verifies the caller's JWT and confirms the caller belongs to the same organisation as the target job before reading amounts or creating a SumUp checkout.

## Scope
Only these files will change:
- `supabase/config.toml` — add function-specific entry
- `supabase/functions/send-payment-link/index.ts` — add auth + tenant check

No other functions, shared helpers, or UI files will be touched.

## Changes

### 1. `supabase/config.toml`

Add:

```text
[functions.send-payment-link]
  verify_jwt = true
```

### 2. `supabase/functions/send-payment-link/index.ts`

Mirror the pattern already used in `send-deposit-link/index.ts`:

1. Read `Authorization` header and reject with 401 if it is missing or not `Bearer ...`.
2. Build a caller-scoped Supabase client using `SUPABASE_ANON_KEY` and the incoming `Authorization` header (plus `x-org-impersonation-token` if present).
3. Call `asCaller.auth.getUser()` and reject with 401 on failure.
4. Call `asCaller.rpc("get_my_org_id")` to resolve `callerOrgId`; reject with 403 on failure.
5. Fetch the job row from `service_calls` (using service-role client) and check `job.organisation_id === callerOrgId` BEFORE any amount/SumUp logic.
6. Return 404 with message `not_found` when the job is missing or the org mismatches, so cross-tenant job IDs are not leaked.
7. Leave the existing balance-due calculation, SumUp checkout creation, WhatsApp message composition, and message_log writes unchanged.

## Verification

- Typecheck/build the project after the edit.
- Show the full git diff for the two files before any deploy.

## Deployment note

No deploy will be performed; the diff is for review only, per standing workflow.
