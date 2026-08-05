# Restore job creation on quote acceptance

Accepting a quote currently only flips its status. The job, the office notification, and the audit entry that used to be created are gone, so accepted quotes never reach the pipeline. This restores that behaviour inside the single database function all accept buttons rely on, and backfills the four quotes already stuck.

## What changes for users

- Approving a quote (public quote page) or marking one accepted (quote detail, quotes list, job quote panel) creates the incoming job again, sends the office notification, and records the audit entry.
- Quote status moves to `converted` with `accepted_at` set and the new job linked, instead of stopping at `Accepted`.
- Quotes with a deposit get their deposit payment link WhatsApp again — that step was silently skipping because no job existed to attach it to.
- Q-2026-0105, Q-2026-0106, Q-2026-0107 and Q-2026-0108 get their missing jobs created and appear in the pipeline as incoming.

## Technical detail

### 1. Migration: rebuild `public.respond_to_quote(uuid, boolean, uuid)`

Keep the current 3-argument, token-validating signature and every existing guard, in the same order:

1. quote exists → `not_found`
2. `access_token` matches → `invalid_token`
3. `access_token_used_at IS NULL` → `already_actioned`
4. authenticated callers must match `get_my_org_id()` → `forbidden`
5. status in `Sent/sent/Draft/draft/viewed` → `invalid_status`

Keep the `jsonb` return contract (`{success: true}` / `{success: false, error: ...}`) — `accept-quote` and `QuoteDetail.tsx` both parse it. Never `RAISE EXCEPTION` for a rejection case; the old 2-arg version did, and that would break the current callers.

After the guards pass and `p_accepted` is true, re-add the accept branch from the pre-rewrite body (last full copy: `supabase/migrations/20260525154623_…sql`):

- Read the quote plus customer, resolving `organisation_id` as `COALESCE(q.organisation_id, c.organisation_id)`.
- If `converted_job_id IS NULL`, carry `job_type` / `assigned_engineer` / `assigned_engineer_id` from the originating `service_calls` row (`quotes.job_id`) and insert the new job with `status = 'incoming'`, `has_quote = true`, `source = 'Quote'`, `quote_id = p_quote_id`, revenue/deposit/balance from the quote, and the org id.
- Update the quote: `status = 'converted'`, `accepted_at = now()`, `converted_job_id = <new job>`, plus `access_token_used_at = now()` (the token single-use guard the rewrite added must stay).
- Insert the `quote_accepted` notification for the quote owner and for each distinct `engineers.auth_user_id` with role `admin`/`office`, scoped to the org.
- Insert the `audit_log` row.
- Reject branch: `status = 'Rejected'`, `access_token_used_at = now()`, and the `quote_declined` audit row.

Idempotency: when `converted_job_id` is already set, do not insert a second job — reuse it, as the old version did.

### 2. Backfill the four stuck quotes

Data-only change for Q-2026-0105 (`3ed0f71e…`), Q-2026-0106 (`9c733e4d…`), Q-2026-0107 (`02452453…`), Q-2026-0108 (`a37d1cb0…`): create one `service_calls` row per quote using the same field mapping as the function, then set `status = 'converted'`, `accepted_at` (use the recorded `access_token_used_at`) and `converted_job_id`. No notifications or WhatsApp for the backfill — these are historical.

### 3. Out of scope for this change

- `src/pages/Quotes.tsx:410` and `src/components/jobs/QuotePanel.tsx:167` still create jobs client-side rather than going through the RPC. Once the function is fixed these become a duplicate-job risk on those two surfaces; worth consolidating, but as a separate follow-up so this change stays reviewable.
- The "Quote accepted — job created ✅" toast in `QuoteDetail.tsx:89` becomes accurate again, so no copy change needed.

## Verification

- Send a test quote in the Dublin Gas test org, approve it from the public quote link, confirm: a job appears as incoming with `quote_id` set, quote status is `converted` with `converted_job_id`, an office notification row exists, and the token cannot be reused (second approve returns `already_actioned`).
- Repeat via "Mark Accepted" on the quote detail page to confirm both entry points produce one job each.
- Confirm the four backfilled quotes show a linked job and no duplicates exist (`service_calls.quote_id` unique per quote).
