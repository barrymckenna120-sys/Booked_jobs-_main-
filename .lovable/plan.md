# TakePaymentModal — BJ-0061a, silent-failure, org trust, cumulative math, ledger insert

Scope: `src/components/payments/TakePaymentModal.tsx`, card/cash branch of `handleGenerate()` only (lines ~164-291). The invoice branch (125-162) is not touched. No migrations, no Edge Function changes.

## 1. BJ-0061a — mark the job completed

Add to the card/cash payload (currently 208-222), matching the invoice branch:

- `status: "Completed"`
- `completed_at: new Date().toISOString()`

**Gated, not unconditional.** Only set when the payment settles the job — i.e. when the patch coming out of `buildPaymentPatch` has `payment_status === "paid"`. A case-D deposit collection (`collectingDeposit`) leaves the job at its current status, because the work has not happened yet; marking a pre-work deposit as Completed would be a new bug worse than the one being fixed. Build the patch into a local first, then conditionally add the two fields.

### What actually listens for `status: "Completed"`

Verified against the live database and the function directory:

- `trg_log_job_completed_activity` → `log_job_completed_activity()`. Fires on `status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed'`; inserts one `customer_activity` row `job_completed`. Idempotent on repeat saves (guarded by the OLD-state check). Desirable — office-collected jobs currently never get this timeline entry.
- `trg_notify_on_job_change` → `notify_on_job_change()`. Same transition guard; when `payment_method IS NOT NULL` it sends a "job completed" notification to office/admin/owner recipients, excluding `auth.uid()`. Since the office user pressing Take Payment *is* `auth.uid()`, they are excluded from their own notification; other office staff get one. Correct behaviour, and the notification body reads the payment label from `NEW.payment_method`, which this same write sets.
- `review-request` Edge Function (cron): selects `status = 'Completed' AND review_sent = false AND completed_at <= now() - 2h`. This is the real behaviour change — office card/cash jobs will now enter the Google review queue, which is the intended BJ-0061a outcome. Worth calling out to Barry explicitly since it sends customer-facing WhatsApp.
- Reporting/filters only, no side effects: `get-business-insights`, `financeMetrics`, `get-upcoming-jobs`, `get-tomorrows-jobs`, `get-service-reminders`, `send-upcoming-reminders`, `deactivate-user`, `cancelIntent`.

Nothing assumes only the invoice or engineer path performs the transition; every listener keys off the row state, not the caller.

**Risk:** a job settled through this modal before the work is done (payment taken up front on a case-C job) would now be marked Completed and enter the review queue early. This already happens on the invoice branch today, so it is consistent rather than new — flagging it as the one behaviour change to confirm with Barry.

## 2. Silent-failure fix

Destructure the line-224 update: `const { error: updateError } = await supabase.from("service_calls").update(...).eq("id", job.id);` and `if (updateError) throw updateError;`.

Because the throw happens before everything downstream, an RLS rejection or constraint violation now aborts before: the `customer_activity` insert, the `job_payments` insert (point 5), `generate-receipt-pdf`, `send-payment-received`, and the `navigate('/receipt-view/:id')` timeout. The existing catch (287-290) shows the destructive toast and returns the user to step 1 with their entered amount intact.

## 3. `organisation_id` trust fix

Move the `service_calls` re-fetch (currently 231, paid-path only) to run unconditionally *before* the write, selecting `organisation_id, customer_id`. If it errors or returns no row, throw immediately — a payment must not be recorded against an unresolvable job.

Use that `organisation_id` for:

- the `settings.cert_prefix` lookup (currently `(job as any).organisation_id` at 172)
- the `customer_activity` insert
- the new `job_payments` insert

`(job as any).organisation_id` is removed from this branch entirely. Also move the `profiles.id` resolution (229-230) up alongside it so `recorded_by` is available regardless of paid/partial outcome.

## 4. Cumulative `collectedToDate`

Replace the `deposit_amount`-only expression (217-219) with the SumUp-webhook derivation, read from pre-write state:

```text
priorCollected = max(0, revenue - balance_due)   // revenue and balance_due as they are before this update
```

Guard: when `revenue` is missing/0 or `balance_due` is null, treat `priorCollected` as 0 (unpriced job — `buildPaymentPatch` already handles the revenue fill). Clamp negatives to 0 so a stale `balance_due > revenue` cannot produce a negative subtrahend.

Regression check against the current logic:

| Scenario | Today | New | Same? |
|---|---|---|---|
| Case A, single deposit (KN-519: rev 500, bal 250, dep 250) | 250 | 500-250 = 250 | yes |
| Case D, deposit not yet paid (rev 500, bal 500) | 0 | 500-500 = 0 | yes (and `deposit` branch ignores it) |
| Case C, no deposit (rev 400, bal 400) | 0 | 400-400 = 0 | yes |
| Unpriced job (rev null/0) | 0 | 0 via guard | yes |
| 2+ prior partials (rev 900, 250 + 200 collected, bal 450) | 250 — **wrong**, understates by 200 | 900-450 = 450 — correct | fixed |

The `payment_type` derivation at 214 is left as-is per your instruction. Note it will still label a third partial payment as `balance`; with the corrected `collectedToDate` the resulting `payment_status`/`balance_due` are right, so the only residual inaccuracy is the ledger label on a 3+ payment job. Out of scope, listed here as known.

## 5. `job_payments` insert

Inserted after the successful `service_calls` write and its error check:

- `organisation_id` — from point 3's re-fetch
- `service_call_id` — `job.id`
- `customer_id` — from the same re-fetch (authoritative over the prop)
- `amount` — `parseFloat(amount)`
- `payment_type` — reuse the existing expression at 214 (`collectingDeposit ? "deposit" : hasDeposit && isDepositPaid ? "balance" : "full"`)
- `method` — `method` (`"card"` / `"cash"`; both are in the CHECK list)
- `source` — `"office_modal"`
- `checkout_id` — `null` (no SumUp checkout on this path)
- `recorded_by` — `profiles.id` from point 3
- `paid_at` — the same `new Date().toISOString()` used for the `paid_at` column, hoisted to one variable so the ledger and the job row agree exactly
- `metadata` — `{ receipt_number: receiptNum }` only. The SumUp path stored transaction/checkout identifiers; there is no equivalent for a manual card/cash take, and the receipt number is the one useful cross-reference. No card data.

**RLS.** This is a browser-side insert as `authenticated`, so `job_payments_insert` applies with `WITH CHECK (organisation_id = get_my_org_id())`; `job_payments_service_role` does not. The value written is the job's own `organisation_id` read back from `service_calls`, which the same session could only read because `service_calls` RLS already scoped it to that user's org — so it equals `get_my_org_id()` for a normal office user. Two consequences to state plainly:

- `get_my_org_id()` resolves impersonation token → JWT `app_metadata.organisation_id` → `profiles.organisation_id`. A superadmin impersonating an org supplies the token on the same request, so both sides agree.
- The insert deliberately does **not** accept an org id from the client prop; a mismatch surfaces as an RLS rejection rather than a mis-attributed row.

**Failure semantics.** Payment is already recorded on `service_calls` at this point. A ledger insert failure is logged loudly (`console.error` with a `LEDGER_INSERT_FAILED` marker) and raised to the user as a non-blocking destructive toast ("Payment recorded, but not added to the payment ledger"), then the flow continues to the receipt view. It must not roll back or block the receipt — mirrors the SumUp webhook's choice to keep the payment outcome authoritative. A duplicate-key error is not expected here (the partial unique index covers `source = 'sumup_webhook'` only), so no `23505` special-casing.

## Verification

- Unit tests for the new `priorCollected` helper covering the five rows in the point-4 table (extracted as a small pure function so it is testable, alongside the existing `paymentSheetAmount` / `paymentUpdate` tests).
- Manual: office card payment on a case-A job — confirm `status Completed`, `completed_at` set, `payment_status paid`, `balance_due 0`, one `job_payments` row with `payment_type balance`.
- Manual: case-D deposit collection — confirm status is **unchanged** and `payment_type deposit`.
- Manual: force an update failure — confirm destructive toast, no navigation, no ledger row.

Risk: high (money path, live tenants). No historical backfill of `job_payments` and no correction of already-completed jobs missing `completed_at` in this step.
