# BJ-B3a-1 — Payment write consolidation (audit answers + build shape)

Read-only audit complete. Findings below, then the build shape they imply.

## 1. Can one writer serve both runtimes?

Yes — one implementation, no synced twins, provided it is a **pure patch builder** rather than a function that owns the DB call.

- Precedent already in the repo: `supabase/functions/_shared/financeMetrics.ts` is re-exported by `src/lib/financeMetrics.ts` and consumed by both Vite and Deno. Same trick works here.
- Where it lives: `supabase/functions/_shared/paymentUpdate.ts` (pure, zero imports — no `npm:`/`Deno` references, or the Vite build breaks), re-exported by `src/lib/paymentUpdate.ts`.
- Shape: `buildPaymentPatch(input) => Partial<ServiceCallRow>`. Each caller applies the returned patch with its own client (`supabase` in the app, service-role `sb` in Edge Functions) and keeps its own side effects (receipt numbering, activity logs, notifications, invoice creation, retry queue).
- Why not a single Edge Function: the engineer card path must work offline through `useRetryQueue`, and `TakePaymentModal` interleaves receipt-number generation and navigation. Routing those through a network call would regress offline completion.

## 2. Per-site logic the shared writer must accept as input (not assume)

Confirmed by reading each site. The writer must take these as explicit inputs, because they are genuinely site-specific:

- `NewJobPanel.tsx` (insert, not update): sets `deposit_required`, `deposit_paid`, `deposit_amount`, `balance_due` from wizard state at booking time, with `balance_due` deliberately `null` unless the payment mode is `deposit`. Booking-time setup — treat as a distinct `type: 'booking_setup'` case, and preserve `null` (not `0`) for non-deposit jobs.
- `ExtraWorkSheet.tsx` (engineer, cash/card): **increments** `revenue` and `balance_due` by the extra subtotal, rounded to 2dp. Additive, not absolute — needs a `mode: 'increment'` input, or the writer must accept `newRevenue`/`newBalance` already computed.
- `ExtraWorkPendingCard.tsx` (office approve): writes the revised combined total to `quotes` (`total_amount`, `balance_due`) — a **quotes** write, not `service_calls`. Out of scope for this writer; leave untouched.
- `TakePaymentModal.tsx`: three distinct branches — invoice (`payment_status: 'unpaid'`, `invoiced_at`, `revenue = balance_due = amount`, plus `status: 'Completed'` and `completed_at`), deposit collection (`deposit_paid: true`, `payment_status: 'partial'`, revenue written, balance left alone), and balance/full settle (`payment_status: 'paid'`, `balance_due: 0` only when a deposit existed). Receipt number + `paid_at` + `customer_activity` insert stay in the component.
- `EngineerJobDetail.tsx` / `useEngineerJobs.ts` completion: `confirmedRevenue` may be undefined, in which case invoice balance falls back to the job's existing `revenue`. That fallback must be an input (`fallbackRevenue`), not a re-read inside the writer.
- `sumupWebhook.ts`: deliberately ignores current `job.deposit_paid` / `payment_status` (they can be stale/racing) and decides from the webhook amount vs `revenue`. Its "partial" branch keeps existing `balance_due` when `revenue <= 0`. That "don't trust job state" rule must survive — the writer takes `amount` + `revenue` and never reads back.
- `create-job-invoice`: writes `payment_status: 'unpaid'` on the job and `deposit_paid`/`balance_due` on the **invoices** row (different table, different meaning — `deposit_paid` there is an amount, not a boolean). Must not be folded in.
- `QuoteForm.tsx`: `balance_due` on `quotes`. Different table. Out of scope.

## 3. Read-site switch to `balance_due` — behaviour will change for 4 live jobs

`OutstandingBalances.tsx` totals currently use `revenue − deposit_amount`; `EngineerOutstandingBalances.tsx` already reads `balance_due`. Both can read `balance_due`, but the switch is **not** invisible — the two calculations already disagree in production. Live rows in the outstanding set where `revenue − deposit_amount = 0` but `balance_due > 0`:

| Job | Org | revenue | deposit_amount | shown today | shown after switch |
|---|---|---|---|---|---|
| DG-381 | Dublin Gas | 246.00 | 246.00 | 0.00 | 246.00 |
| DG-382 | Dublin Gas | 184.50 | 184.50 | 0.00 | 184.50 |
| DG-386 | Dublin Gas | 246.00 | 246.00 | 0.00 | 246.00 |
| KN-192 | K&N | 184.50 | 184.50 | 0.00 | 184.50 |

Net effect: Dublin Gas outstanding total **+676.50**, K&N **+184.50**. Every other outstanding job (KN-131, 195, 222, 336, 416, 465, 471–474, 477, DG-385, DG-387) agrees exactly and is unaffected.

Reading of it: the office ledger is currently **understating** these balances to €0 because `deposit_amount` was populated with the full job total on invoice-method jobs where nothing was actually collected. `balance_due` is right, the derived figure is wrong. Barry should sight-check DG-381/382/386 and KN-192 before we ship, since his outstanding total will jump by €861.

## 4. The two known disagreements

Confirmed and resolved in favour of the hook, not a third behaviour:

- Cash/card completion: `useEngineerJobs.ts` sets `payment_status: 'paid'` **and** `balance_due: 0`; `EngineerJobDetail.tsx` sets `paid` but leaves `balance_due` stale. Fix: `EngineerJobDetail` adopts `balance_due: 0`.
- `TakePaymentModal` only zeroes `balance_due` when a deposit existed. Fix: zero it on any full settle, matching the hook.

## 5. Blast radius — Make-exposed functions

No output field names or types change. The nine functions that surface these values are read-only over `service_calls` and keep their current response keys:

`get-outstanding-invoices` (`balance_due`), `get-service-reminders` (`payment_status`), `renewal-reminder-14`, `renewal-reminder-30`, `get-business-insights`, `generate-accountant-export`, `send-payment-link`, `send-invoice-whatsapp`, `send-deposit-reminder`.

Only `create-job-invoice` and `sumup-payment-webhook` write, and neither changes its response shape — `create-job-invoice` keeps its own `invoices` write untouched, the webhook keeps returning the same acknowledgement body. Values Make receives can change for the four rows in section 3 only.

## Build steps (on approval)

1. Add `supabase/functions/_shared/paymentUpdate.ts` — pure `buildPaymentPatch({ type: 'booking_setup' | 'deposit' | 'balance' | 'full' | 'invoice', amount, method, revenue, fallbackRevenue, hadDeposit, mode })`, plus unit tests covering each of the branches in section 2 (case-by-case parity against the current code).
2. Re-export from `src/lib/paymentUpdate.ts`.
3. Migrate write sites one at a time, each verified against its test: `TakePaymentModal` → `useEngineerJobs` → `EngineerJobDetail` (adopting `balance_due: 0`) → `sumupWebhook` → `NewJobPanel` booking setup → `ExtraWorkSheet` increment.
4. Switch `OutstandingBalances.tsx` totals to `balance_due`; leave `EngineerOutstandingBalances.tsx` as-is (already correct).
5. Leave `quotes` and `invoices` writes (`QuoteForm`, `ExtraWorkPendingCard`, `create-job-invoice`) out of scope.
6. Verify on a scratch job per branch (deposit → balance, invoice, extra work) plus a re-read of the four section-3 rows to confirm no value moved.
