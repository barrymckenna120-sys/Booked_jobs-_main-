# BJ-0050b: Live parity verification (send-deposit-link + accept-quote)

No code changes. This run only produces evidence for the two callers that previously had no reuse protection. It does create real (sandbox) SumUp checkouts and sends a real WhatsApp on the accept-quote path, so it needs approval before running.

## Confirmed before running (read-only checks already done)

- K&N Gas Services org id `8c37827f-...d89856` has an active SumUp integration: `integration_type: sumup`, `environment: sandbox`, `merchant_code: MBBMEYG7`, key from `SUMUP_API_KEY`. Dublin Gas has no SumUp integration row, which is why the earlier attempt 404'd — a K&N session is required.
- K&N users available for a session include an `admin` (officeapp@bookedjobs.ie) and two superadmins.
- `payment_checkout_attempts` currently holds 5 rows in total, so row counts are easy to attribute.
- Candidate K&N jobs with a deposit and no checkout yet: KN-472 (EUR 100), KN-471 (EUR 100), KN-473 (EUR 200).

## Steps

### 1. Session

Mint a preview session for the K&N admin user, then assert `get_my_org_id()` returns the K&N org id before any function call. If it resolves anywhere else, stop and report — no guard changes.

### 2. send-deposit-link, twice

Use KN-472 (deposit EUR 100, `sumup_checkout_id` currently null).

- Call 1: expect a new checkout, `reused: false`, exactly one new `payment_checkout_attempts` row with reference `<job-id>::1`.
- Call 2, immediately, same job and amount: expect `{ success: true, skipped: "checkout_already_pending", payment_link: <same link> }`, no new row.
- Paste both raw HTTP bodies and the raw `payment_checkout_attempts` rows for that job id before/after each call.

### 3. accept-quote deposit path, twice

Find a K&N quote with a deposit that is not yet accepted (query first; if none exists, say so rather than inventing one).

- Accept 1: expect job created/linked, checkout created, WhatsApp sent, one attempt row.
- Accept 2: `accept-quote` is a one-shot state transition (a quote already `accepted` will not run the deposit path again). If re-triggering is not possible without faking state, that will be stated explicitly and the fallback used instead: two direct calls to `send-payment-link` for the same job and amount, which routes through the same `depositLink.ts`/`createSumUpDepositCheckout` code path. The fallback will be labelled as a fallback, not the primary test.
- Paste both raw bodies plus the attempt rows.

### 4. Reporting

Raw HTTP responses and raw SQL result rows only, with real checkout ids and counts. Any step that cannot be run live will be reported as not run, with the reason.

## Not in scope here

BJ-0052 (engineers `auth_user_id` self-repoint evidence), BJ-0053, BJ-0054 and BJ-0051 stay open as separate items — each gets its own prompt and its own evidence.
