# Stop duplicate jobs from one quote

## Confirmed root cause and scope

- KN-018 and KN-020 were not created from the same quote: KN-018 belongs to Q-2026-0008 and KN-020 belongs to Q-2026-0010. Each has its own checkout and paid deposit. No payment callback created either job; payment callbacks only updated their existing job.
- The same-quote path still has two genuine duplicate risks: `respond_to_quote` does not lock the quote row before checking `converted_job_id`, and the job-screen quote panel bypasses that function and inserts a job directly.
- No existing quote currently has more than one job linked by `quote_id`, so this is a prevention fix. KN-018/KN-020 history, payments, customer data, and both distinct quotes will remain unchanged.

## Change

1. Add one focused database migration that:
   - locks the quote row during acceptance so concurrent requests serialize;
   - re-checks the locked row before creating a job;
   - adds a unique partial index on `service_calls.quote_id` so the database permits only one job per quote;
   - preserves the existing token, tenant, placeholder-reuse, notification, audit, deposit, and response behavior.
2. Change only the job-screen “Mark as Accepted” action to use the existing `accept-quote` path instead of directly inserting a job. Keep its loading, error, refresh, and linked-job behavior aligned with the quote-detail screen.
3. Add regression coverage for the acceptance decision/UI path if it can be isolated without widening the change. The database constraint and transactional simulation remain the authoritative concurrency checks.

## Verification

- Run a rolled-back database simulation proving concurrent/repeated acceptance of one quote results in one job.
- Confirm a repeated request and later payment callback cannot insert another job.
- Confirm two distinct quotes can still create separate jobs.
- Confirm cross-tenant acceptance remains denied and the unique rule does not cross-link tenants.
- Run focused regression tests, the full test suite, type checks, and build.
- Check the job-screen acceptance flow at mobile width, including loading and error behavior, without making a live payment.
- Read back KN-018/KN-020 unchanged and report any remaining directly related risk.

## Files

- One new migration under `supabase/migrations/`.
- `src/components/jobs/QuotePanel.tsx`.
- At most one focused test file if needed.
