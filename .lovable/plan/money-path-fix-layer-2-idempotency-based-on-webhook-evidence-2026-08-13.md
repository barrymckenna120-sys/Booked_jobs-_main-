# Money-path fix: layer 2 idempotency based on webhook evidence

## Problem
Layer 2 of the SumUp webhook handler decides "already paid" from `job.payment_status` / `job.deposit_paid`. Those fields were mis-stamped at job creation by the New Job wizard, so a real payment webhook can be silently discarded and the money never reaches Finance.

## The change

`supabase/functions/_shared/sumupWebhook.ts`
- Add one optional dependency: `hasOtherClaimedEvent?: (entry: { serviceCallId: string; checkoutId: string }) => Promise<boolean>`.
- Replace the layer 2 block (lines 336-341) with: if that dependency reports a prior claimed `sumup_webhook_events` row for the same `service_call_id` under a **different** `checkout_id`, return `{ outcome: "duplicate", status: 200, jobId, amount }` — identical shape and log line semantics to today. Otherwise fall through and build/apply the patch.
- No reads of `job.deposit_paid` or `job.payment_status` remain in this decision. Nothing else in the handler changes: secret check, parsing, checkout re-fetch/verification, `claimEvent` (layer 1, still runs first), patch contents, activity/message logs, office notification all untouched.

`supabase/functions/sumup-payment-webhook/index.ts`
- Implement `hasOtherClaimedEvent` with a service-role select on `sumup_webhook_events` filtered by `service_call_id = job` and `checkout_id != current`, limit 1.
- Explicit error bucketing, no blanket catch: a successful query with an empty result set (`data = []`, no `error`, or PostgREST `PGRST116` no-rows) means no prior event → proceed. Any real failure — network/connection error, permission denied (`42501`), undefined table/column (`42P01`, `42703`), malformed query (`42601`, `22P02`), or any other returned `error` code — throws, and the shared handler turns that into a 500 (`outcome: "duplicate_check_failed"`) so SumUp retries instead of proceeding as if clear. The handler never patches or writes on that path.

`supabase/functions/_shared/sumupWebhook.test.ts`
- Add Deno cases: (a) mis-stamped job (`deposit_paid = true`, no prior event) processes and patches correctly; (b) prior claimed event under a different checkout id → `duplicate`, `updateJob` never called; (c) same checkout id re-delivered → still short-circuited by layer 1 `claimEvent` before layer 2 is reached; (d) `hasOtherClaimedEvent` throwing a genuine query failure → status 500, no patch/write.


## Verification with real evidence
1. Control — KN-477: confirm no other claimed event exists for it, so behaviour and stored state are unchanged.
2. Mis-stamp repro: create a K&N test job through the wizard with Deposit Taken, set `deposit_paid = true` directly in the DB with no webhook event on record, then fire a real sandbox SumUp webhook for its actual checkout. Confirm the job updates and `message_log` + `customer_activity` rows appear.
3. Genuine double checkout: pay the first checkout (real webhook, job goes partial/paid), then create a second checkout on the same job and fire its webhook. Confirm outcome `duplicate`, no second write, `balance_due` unchanged.
4. True duplicate delivery: redeliver the same event twice, confirm layer 1 `claimEvent` still catches it.

Then delete all test jobs, checkouts, webhook events, message and activity rows created during testing.

## Risk
Medium-high (money path), mitigated by unit tests plus the four live checks above. No schema change; `sumup_webhook_events` already has `service_call_id` and a unique `checkout_id`.
