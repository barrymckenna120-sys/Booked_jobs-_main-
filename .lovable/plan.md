# BJ-0050b: disposable K&N test quote + accept-quote live parity

Read-write run on the live K&N tenant, deliberately isolated to one throwaway customer/quote/job. Needs approval because it creates real (sandbox) SumUp checkouts and attempts one real WhatsApp send to a fake number.

## 1. Seed via the real write path

Sign in the preview as the K&N admin (`officeapp@bookedjobs.ie`), assert `get_my_org_id()` returns `8c37827f-…d89856` before anything else. If it resolves elsewhere, stop and report.

Then drive the app UI (Playwright, localhost preview) through the normal flows:

- New customer: name `TEST DO NOT CONTACT`, phone `+353000000000` (unused/fake), email `test-scratch@bookedjobs.ie`, address/eircode marked `TEST` (both are NOT NULL).
- New quote for that customer via `/quotes/new`: one line item totalling €200, deposit required €50, then send/mark it so `status = 'sent'` — the state `respond_to_quote` expects.
- Paste the created customer row and the full created quote row (id, `quote_number`, `status`, `deposit`, `access_token` redacted to first 8 chars, `organisation_id`, `total_amount`).

Baseline: record the exact `payment_checkout_attempts` count before Step 2.

## 2. accept-quote, live, twice

Accept 1 — the normal customer path: `POST /functions/v1/accept-quote` with `{ quote_id, access_token }` exactly as the public quote page sends it.

Expected and to be shown from raw output: `respond_to_quote` succeeds, job created and linked (`converted_job_id`), one new `payment_checkout_attempts` row with reference `<job-id>::1`, a real sandbox checkout id, `reused: false` on the underlying deposit result. WhatsApp to the fake number will fail or no-op — logged, not part of the assertion.

Accept 2 — same call, same quote, immediately after. `accept-quote` is a one-shot state transition: `respond_to_quote` gates on the quote still being pending, so the second call is expected to be rejected before the deposit path runs. That outcome will be reported plainly as "entry point cannot be double-called live", with the raw rejection body, and the step reduces to:

- confirming Accept 1's response shape and the WhatsApp-skip branch match spec, and
- the already-recorded fallback: two direct `send-payment-link` calls for the same job/amount, which run the same `depositLink.ts` → `createSumUpDepositCheckout` → `findReusableCheckout` code path. Labelled as fallback, not the primary test.

Raw HTTP bodies for both calls plus the raw attempt rows before/after each.

## 3. Cleanup

Hard delete, in FK-safe order: the test job's dependent rows (`payment_checkout_attempts`, `customer_activity`, `message_log`, `invoices`/line items if any), then the service call, then `quote_line_items` + the quote, then the customer. Post-cleanup verification queries pasted showing zero remaining rows for each id, and a re-check that `payment_checkout_attempts` is back to its pre-test count.

If any FK blocks a delete, that row is instead flagged as test data (`notes` prefixed `TEST DATA — BJ-0050b, safe to delete`) and reported explicitly rather than left silently behind.

## 4. Evidence

Raw HTTP responses, raw SQL rows, real ids and counts, cleanup verification output. Anything not runnable live is reported as not run with the reason.
