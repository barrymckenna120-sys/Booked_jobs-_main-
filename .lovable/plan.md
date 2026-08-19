# BJ-B4g — Fix the EngineerJobCard raw-revenue clobber

## Part A — Sweep results (read-only, already run)

```sql
select job_reference, organisation_id, revenue, deposit_amount, balance_due,
       payment_status, payment_method, completed_at, paid_at, receipt_number
from service_calls
where payment_status = 'partial' and revenue = deposit_amount
  and revenue = balance_due and status <> 'Cancelled';
```

| Job | Org | revenue | deposit | balance | method | completed_at | paid_at | receipt |
|---|---|---|---|---|---|---|---|---|
| KN-192 | K&N | 184.50 | 184.50 | 184.50 | card | 2026-04-03 20:43 | 2026-04-03 20:42 | K-091 |
| KN-495 | K&N | 250.00 | 250.00 | 250.00 | card | 2026-08-19 12:19 | 2026-08-19 12:19 | KN-2026-4258 |
| KN-497 | K&N | 250.00 | 250.00 | 250.00 | card | 2026-08-19 12:14 | 2026-08-19 12:14 | KN-2026-0478 |
| KN-498 | K&N | 250.00 | 250.00 | 250.00 | card | (null) | 2026-08-19 13:02 | (null) |
| KN-500 | K&N | 1383.75 | 1383.75 | 1383.75 | card | 2026-08-19 13:21 | 2026-08-19 13:21 | KN-2026-6736 |

Five rows, all K&N, none on Dublin Gas. KN-495 and KN-497 are the ZZ SCRATCH jobs from this morning's BJ-B5 run, so the live-customer exposure is KN-498, KN-500 and KN-192 (April — same shape, predates today, so this signature is not new). No row outside K&N matches, which is consistent with Dublin Gas engineers not having used the card completion path with a deposit on the job.

## Part B — The fix

### 1. `src/components/engineer/EngineerJobCard.tsx`

Both `PaymentSheet` `onDone` handlers pass `revenue: confirmedAmount` (lines 357 and 372). Change both to `confirmedRevenue: confirmedAmount` — the key `updateJob` actually destructures, which routes the amount through `buildPaymentPatch` instead of writing it straight to the `revenue` column.

### 2. Boundary hardening — one deviation from the brief, deliberate

Adding `revenue` to `SERVICE_CALL_UI_ONLY_KEYS` in `src/lib/serviceCallUpdate.ts` would break the fix, because `sanitizeServiceCallUpdatePayload` is called a **second** time (`useEngineerJobs.ts:331`, `EngineerJobDetail.tsx:327`) *after* `buildPaymentPatch` has merged its own legitimate `revenue` into the patch. A blanket blocklist would strip that too — including the unpriced-job fill case.

So instead:

- Add a separate export in `src/lib/serviceCallUpdate.ts`: `stripCallerRevenue(patch)` (documented as "only `buildPaymentPatch` may set `revenue` on payment updates"), leaving `SERVICE_CALL_UI_ONLY_KEYS` untouched.
- Apply it to the caller-supplied `rest` only, in `useEngineerJobs.updateJob` (line 246), `EngineerJobDetail.updateJob` (line 240) and `EngineerApp.tsx:114`.

Verified safe: no other caller of the sanitizer passes `revenue` in an update. `Quotes.tsx:430` is an insert, `ExtraWorkSheet` writes its `buildPaymentPatch` result directly without the sanitizer, and `Quotes.tsx:252` / `Schedule.tsx` / `JobDetail.tsx` patches carry no `revenue` key.

Two side effects, both benign: the payment-activity label at `useEngineerJobs.ts:378` falls back from `safeDbPatch.revenue` to `confirmedRevenue` (the amount actually collected — the correct figure for that label), and `src/pages/EngineerApp.tsx` has no importers anywhere in `src/`, so it is dead code being hardened for consistency only.

### 3. Tests (`src/lib/__tests__/`)

- Regression: a card-shaped completion patch (`confirmedRevenue: 1383.75`) against a job with `revenue 2767.50`, `deposit_amount 1383.75`, `deposit_paid true`, `balance_due 1383.75` → `revenue` stays 2767.50, `balance_due` 0, `payment_status` `paid`.
- Boundary: a patch containing a raw `revenue` key has it dropped by `stripCallerRevenue`, while `buildPaymentPatch`-derived `revenue` still survives the existing sanitizer.

## Verification

- Full `vitest` run plus `tsgo` typecheck.
- Live repro on both tenants: create a ZZ SCRATCH quote, accept it (job created with the quote total), take the deposit, then complete **from the job card** (not the detail page). Read back `revenue`, `deposit_amount`, `balance_due`, `payment_status` by SQL and confirm the quote total survives on K&N and Dublin Gas.
- Diff, test output and repro read-backs shown before this is called done.

## Part C — Data

No writes to KN-500, KN-498, KN-192, KN-495 or KN-497 in this change. Corrections come later as a separate approved migration once you have reviewed the sweep above.
