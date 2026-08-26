# BJ-next-D — Authoritative pre-write balance check (engineer payments)

Stop a second payment being recorded on a job that is already settled, by checking the database's own numbers immediately before the write instead of trusting the copy of the job held in the screen.

## Behaviour after this change

- Any engineer-app payment (deposit pill link, big Take Payment button, post-Complete Confirm Job Total, Outstanding Balances) re-reads the job from the database right before writing.
- If those fresh numbers say the job is fully paid, nothing is written: no ledger row, no job update, no receipt. The engineer sees the existing "This job is fully paid — no further payment can be collected here" panel with its current Complete Job / Close options.
- If money is still owing, the write proceeds exactly as today, but the arithmetic uses the freshly read balance rather than the stale one.
- Common case (one surface, no race) is unchanged.

## Technical detail

Shared gate helper (new, pure + one query): `src/lib/paymentPreWriteGate.ts`
- `fetchJobPaymentState(supabase, jobId)` — single query reusing TakePaymentModal's shape, extended to the columns the classifier needs: `organisation_id, customer_id, status, revenue, balance_due, payment_status, deposit_paid, deposit_required, deposit_amount`.
- `assertCollectable(freshRow)` — runs `resolvePaymentSheetState` (unchanged classifier) and throws `JobAlreadyPaidError` on Case B; otherwise returns the fresh row + state.
- Export `JobAlreadyPaidError` alongside the existing `PaymentAmountError` convention.

`src/hooks/useEngineerJobs.ts` (surfaces 1 and 3)
- In `updateJob`, for `paymentMethod` present and not `invoice`, call the gate after the existing amount validation and before `buildEngineerPaymentPlan`.
- On Case B: throw `JobAlreadyPaidError` — no `service_calls` update, no `job_payments` insert, no retry-queue entry.
- Not Case B: pass the fresh row into `buildEngineerPaymentPlan` as `job` (merged over the in-memory job so unrelated fields survive) so `priorCollected` uses fresh `revenue`/`balance_due`. `engineerPaymentPlan.ts` itself is unchanged.

Shared fully-paid panel (extraction, no new copy): `src/components/payments/JobFullyPaidPanel.tsx`
- Lift the existing Case B markup out of `PaymentSheet.tsx:91-128` verbatim (heading, "This job is fully paid", "No further payment can be collected here", "Amount already collected" row, optional Complete Job button, dismiss button) into one presentational component taking `collected`, `customerName`, `onCompleteOnly?`, `onClose`.
- `PaymentSheet` renders it inside `EngineerSheet`; `TakePaymentModal` renders the same component inside its `DialogContent`. One implementation, two shells — no parallel copy of the copy or layout.

`src/pages/engineer/EngineerJobDetail.tsx` and `src/components/engineer/EngineerJobCard.tsx`
- Catch `JobAlreadyPaidError` in the payment handlers, keep `PaymentSheet` open, and pass a new `forceFullyPaid` prop so it renders that same panel. No new copy, no new UI state.

`src/components/payments/TakePaymentModal.tsx` (surfaces 2 and 4)
- Move the existing pre-write read to the gate helper and make it authoritative: on Case B, stop before any write and render `JobFullyPaidPanel` (replacing today's toast-and-return), instead of only using the read for maths.
- Keep the existing receipt-number check untouched.

Not in this ticket: EngineerOutstandingBalances refetch/`payment_status` passthrough (Fix 2), any DB constraint or trigger against over-collection (Fix 3), `job_payments` schema changes.

## Verification

- New `src/lib/__tests__/paymentPreWriteGate.test.ts`: Case B throws, Cases A/C/D pass through with the fresh balance.
- `useEngineerJobs` payment path: Case B fresh read → zero inserts/updates and the fully-paid state surfaces; not Case B → write proceeds using the fresh `balance_due`.
- `TakePaymentModal`: same two assertions against its existing re-read.
- Regression: full existing suite (incl. `engineerPaymentPlan.test.ts`, `paymentSheetAmount.test.ts`, `paymentUpdate.test.ts`) stays green.
- Manual scratch-job check (no real customer): pay via the deposit-pill surface, then immediately run Confirm Job Total before any refresh — must show the fully-paid state, with no second `job_payments` row.

Reported back: pasted test output, per-file diffs, and the scratch-job result.

## Pre-existing build error to fix first

`src/pages/engineer/EngineerJobDetail.tsx` calls `addToQueue` (lines 353-390) without importing it, so the app currently fails to typecheck. One-line fix as the first step of this ticket: `import { addToQueue } from "@/hooks/useRetryQueue";` (it is a module-level export there, no hook needed).
