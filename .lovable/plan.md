# Engineer balances: real list + deposit/balance on the job card

Two changes to the engineer app, both frontend only. No schema changes, no changes to how payments are recorded.

## 1. Engineer Outstanding Balances — a real list

Today `src/components/engineer/EngineerOutstandingBalances.tsx` renders a single amber banner ("⚠️ 2 outstanding balances · €1,230.00") that navigates to the office Finance page. Engineers get no detail and no way to act.

Replace it with an expandable card list on Engineer → Today:

- Collapsed: the same amber summary bar (count + total), tappable to expand rather than navigating away.
- Expanded: one row per job showing customer name, job reference, job type, scheduled date, and the balance due in bold.
- Each row gets two actions: **Take Payment** (opens the existing `TakePaymentModal`, so the four-case deposit logic in `paymentSheetAmount.ts` applies unchanged) and **Send Link** (invokes `send-payment-link` with `service_call_id`, same call the office ledger makes, with a sending spinner and success/failure toast).
- Tapping the row body (not the buttons) opens `/engineer/job/:id`.
- Empty state: the component renders nothing, as it does today.

**Qualification logic changes to match the office.** The current filter requires `deposit_paid = true` and computes the balance as `revenue - deposit_amount`, ignoring `balance_due`. That is why a job like KN-129 (balance_due 1230, deposit_paid false) is invisible to the engineer while showing on the office ledger. The engineer list will use the shared `isOutstandingBalanceJob` helper from `src/lib/outstandingBalances.ts` and display `balance_due` — same source of truth as Finance → Sales, scoped to `assigned_engineer_id = the logged-in engineer`.

This means the engineer's count and total will now agree with the office page. It may show more jobs than the banner shows today; that is the intended correction.

## 2. Deposit + balance on the engineer job card

The card's only payment signal is the Paid/Pending pill in `InfoPills.tsx`, which shows no amounts and renders even when there is no deposit at all.

- Suppress the pill entirely when the job has no deposit context (no `deposit_amount` and not `deposit_required`) — a €0 "Pending" pill on a straight-cash job is noise.
- When a deposit has been taken, the pill reads `Deposit €X paid` (success styling).
- When a deposit is owed, it reads `Deposit €X due` (warning styling).
- Directly beneath the pills, when a balance remains (`balance_due > 0` and not fully paid), add one low-emphasis line: `Balance due €Y`. Only rendered when there is a real balance, so most cards are unchanged.

Same treatment applied to the engineer job detail header (`EngineerJobDetail.tsx`) so the card and detail view agree.

## Not in scope

The data issues found in the audit are left alone: KN-128's null `revenue`, KN-129's `deposit_paid = false` against a 1230 balance, and rows stamped `paid_at` while still `unpaid`. Reading from `balance_due` means the list handles them correctly without editing production rows. Raise separately if you want those cleaned up.

## Technical notes

- `src/components/engineer/EngineerOutstandingBalances.tsx` — rewritten. Query widens to `id, job_reference, scheduled_date, job_type, revenue, deposit_amount, deposit_paid, deposit_required, payment_method, payment_status, invoiced_at, balance_due, customers(name, phone)`; filtered through `isOutstandingBalanceJob`. Uses a hardcoded select string per project convention.
- `src/components/engineer/job-card/InfoPills.tsx` — props extend to `depositAmount`, `depositRequired`, `balanceDue`; pill becomes conditional. `EngineerJobCard.tsx` passes the new props.
- `src/pages/engineer/EngineerJobDetail.tsx` — deposit row made conditional and balance line added.
- Unit tests: extend `src/lib/outstandingBalances.test.ts` with the engineer-scoping cases (balance with `deposit_paid` false, zero balance, cancelled job), and add a small pure helper + test for the pill's label/visibility decision so it is covered without rendering markup.
- Verification: Playwright on `/engineer/today` as the test engineer account — confirm the list expands, rows show balances, and the office Finance total matches.
