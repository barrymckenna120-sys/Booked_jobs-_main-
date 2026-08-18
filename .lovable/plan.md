# Fix: "deposit requested" must not reduce Balance Due before it is paid

Root cause confirmed: at job creation the New Job wizard treats a *requested* deposit as if it were *collected*, both in the number it writes to the job and the number it shows office staff. Fix covers the wizard (write + display) and hardens the shared payment-patch builder so no future caller can reintroduce it.

## 1. New Job wizard (`src/components/jobs/NewJobPanel.tsx`)

At creation, "Deposit Taken" only means a SumUp link will be requested — no money has arrived. So:

- **Write (line 1143)**: stop subtracting the deposit. `balanceDue` becomes the full job total when the job is priced, `null` when unpriced, and stays `null` for the paid-upfront mode (nothing outstanding). `depositAmount` and `deposit_required` keep their current behaviour — the deposit is still requested, it just no longer discounts the balance.
- **Display (line 1240)**: the read-only "Balance Due €" field shows the full total instead of total − deposit, so Nicole/Mary see the true outstanding figure while entering the job. Add a one-line helper under the field: deposit is deducted once paid.

Once the deposit is actually paid, the SumUp webhook / Take Payment flow reduces `balance_due` through the existing `buildPaymentPatch` paths — unchanged.

## 2. Defensive hardening in `supabase/functions/_shared/paymentUpdate.ts`

Answer to the open question: **yes, `booking_setup` should refuse a caller-supplied `balanceDue` below total unless payment is evidenced.**

Current `booking_setup` trusts `input.balanceDue` whenever mode is `deposit` and `collectedToDate` is absent — precisely the hole the wizard fell through. Change it to:

- Accept `balanceDue` only when it is `>= total`, or when payment is evidenced (`collectedToDate` set, or mode `paid`).
- Otherwise derive `balance_due = round2(max(0, total − collectedToDate))`, ignoring the untrusted input, so a requested-but-unpaid deposit can never discount the balance regardless of caller.
- Keep existing behaviour for `paid` (null) and unpriced (null), and keep `collectedToDate` taking precedence over `balanceDue`.

Update the doc comment to state the rule, and add unit tests in `src/lib/__tests__/paymentUpdate.test.ts`:
- deposit requested, no `collectedToDate`, caller passes discounted `balanceDue` → full total outstanding (regression test for KN-490)
- deposit requested with `collectedToDate` → total − collected
- paid mode → null; unpriced → null

Nothing else changes: Outstanding Balances query filter, `isOutstandingBalanceJob()`, receipts, and webhook logic are untouched.

## 3. Data correction — separate task, not in this change

The 32 affected rows are listed in chat (K&N 27, Dublin Gas 4, plus 1 legacy `DU-012`). Several are `Booked` and may be mid-payment-cycle, and three already read `paid`, so no bulk migration is proposed here. Decide row-by-row after Barry reviews the list; that work gets its own plan and migration.

## Delivery

Diff shown for review before anything is applied; no files written until approved.
