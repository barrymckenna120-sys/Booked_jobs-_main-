# SumUp deposit visibility — close the remaining gaps

Most of this scope is already in place from the previous pass. This plan states what is verified as done, and the four items that still need work. Nothing outside the six listed files will be touched.

## Requirement 0 — idempotency: which case applies

**A dedup mechanism already exists — no new column or table is needed.**

Where the guard lives: `supabase/functions/_shared/sumupWebhook.ts`, in `handleSumUpWebhook` just before the job patch is built.

How it is keyed:
- The webhook resolves the job by `service_calls.sumup_checkout_id` (SumUp's checkout id). Externally created checkouts are matched by `checkout_reference` and then have their checkout id backfilled onto the job, so every later delivery of that same checkout matches directly.
- The guard itself is job-state based: it treats the delivery as a duplicate when `payment_status === "paid"`, or when the payment is partial and the job is already `partial` / `deposit_paid`. On that path it returns `outcome: "duplicate"` and returns **before** `updateJob`, so `paid_at` is not re-stamped and none of `logActivity`, `logMessage`, or `notifyOffice` run.
- A genuinely later balance-clearing payment is still processed because the guard checks `payment_status`, not the presence of `paid_at`.

Because the guard fires before every write, the new notification is covered by it automatically.

## Already verified in the code (no change needed)

- `sumupWebhook.ts` stamps `paid_at` on partial payments and the "already paid" guard is `payment_status`-only.
- `OutstandingBalances.tsx` query now reads `.or("invoiced_at.not.is.null,payment_method.eq.invoice,deposit_paid.eq.true")` and still carries **both** `.neq("payment_status", "paid")` and `.not("status", "eq", "Cancelled")` unchanged.
- `sumup-payment-webhook/index.ts` has `notifyOffice`, resolving active `office` / `admin` / `owner` profiles scoped to the job's `organisation_id` and inserting `notification_type: "payment_collected"` with `job_id`, job reference and amount — reusing the existing bell rendering path.
- `src/lib/outstandingBalances.ts` + `outstandingBalances.test.ts` cover the inclusion rule (deposit-paid never-invoiced included with the right outstanding amount; fully paid excluded).
- `sumupWebhook.test.ts` already covers: partial stamps `paid_at`; balance payment settles a part-paid job to `paid`; duplicate deposit delivery does not double-log or re-stamp; notification raised exactly once and never on duplicate/unpaid/failed-update.

## Remaining work

1. **Quote Activity — pending "Deposit Paid" step** (`src/pages/QuoteDetail.tsx`)
   The step exists but is dropped by the `.filter((step) => step.active)` call, so it is invisible until a payment lands. Keep it in the list when unpaid and render it in the same muted/pending style already used for a not-yet-reached step (muted dot, muted label, "—" instead of a date). Paid state stays as it is: `Deposit Paid · €246.00` plus the payment timestamp.

2. **Cross-tenant notification test** (`sumupWebhook.test.ts`)
   Add an explicit test that a K&N payment resolves `notifyOffice` with K&N's `organisation_id` only, and that a stub recipient resolver keyed by org returns no Dublin Gas / Cavan Gas recipients — i.e. the notification cannot fan out past the owning org.

3. **KN-465 data fix as a migration file**
   The `paid_at` value for KN-465 was set directly during the earlier pass. Re-confirm the stored value against the SumUp payment time, then record the same single-row update as the scoped data-fix migration so the change is reproducible. Scoped by the job's id only — one row, no other rows in `service_calls`.

4. **Manual verification with evidence**
   Re-run and report with real output, not assertions:
   - a query of KN-465's `revenue`, `deposit_amount`, `deposit_paid`, `payment_status`, `paid_at`, `balance_due`, plus the Finance → Sales row showing €246 taken / €246 outstanding (screenshot);
   - the `notifications` row for this job (`notification_type`, `recipient_user_id`, `organisation_id`) and the bell drawer showing it;
   - the Q-2026-0115 Activity timeline showing `Deposit Paid — €246.00` (screenshot);
   - a console-error check on both pages, and a diff summary confirming only the six listed files changed.

## Technical notes

- Test additions are Deno tests in the existing file, run with the same command as the current suite; `outstandingBalances.test.ts` runs under vitest.
- No schema change is proposed: the only migration is the single-row KN-465 data fix.
- The notification recipient query stays exactly the pattern used by the quote-accepted alert (`profiles`, `is_active`, role in office/admin/owner, scoped by `organisation_id`).
