# Fix: invoices showing €0.00 owed when money is still due

## Root cause (confirmed from live data and code)
The wrong zero comes from the amount calculation in the invoice creator (`create-job-invoice`). That same calculation feeds the invoice record, the PDF and the WhatsApp message. Two faults:

1. **No quote and no job price gives a €0 total, even when a balance is owed.** Without a linked quote, the invoice total is taken only from the job's price (`revenue`). If that is empty, the total becomes €0 and the balance becomes €0. The job's own stored balance owed (`balance_due`) is ignored.
   - Real case: INV-2026-0004 (K&N, job KN-191). The job has no price and no quote, but €184.50 owed. The invoice was stored and sent as total €0 and balance €0.
2. **A required deposit is treated as already paid.** With a quote, "deposit paid" is set to the quote's *required* deposit, whether or not the customer paid it. When the deposit equals the whole price, the balance drops to €0.
   - Four live invoices (INV-0001, 0008, 0011, 0012) record the deposit as paid while the job says it was not. Their balances are understated today, though not zero.

The office invoice screen reads the job's own balance, so it can disagree with the PDF.

## Fix (1 file: `supabase/functions/create-job-invoice/index.ts`)
- **Deposit:** count it as paid only when the job says the deposit was paid. Otherwise it is €0 paid.
- **Total with no quote:** use the job price. If that is missing, use the job's stored balance owed plus any deposit actually paid, so it is never €0 when money is owed.
- **Balance owed:** total minus deposit actually paid, never below €0. The same value is used for the invoice record, the PDF "Balance Due" line and the WhatsApp message, so all three always match.
- **Fully paid jobs** (job balance 0 and marked paid) still show €0.00.
- **Unchanged:** the job price is never written (revenue rule), and the payment history, access checks, tenant check and message wording are untouched.

Small pure helper inside the same file for the sums, plus one test file for it (so 2 files).

## Verification
- Unit tests for the helper:
  - unpaid, no deposit: full amount
  - deposit paid: remainder
  - deposit required but unpaid: full amount
  - no price, balance €184.50: €184.50
  - fully paid: €0.00
  - partly paid: correct remainder
- Deploy only `create-job-invoice` after approval, then create an invoice for a scratch job on the K&N TEST tenant. No messages go to real customers.
  - Read back the invoice row.
  - Open the PDF and confirm Balance Due matches the office screen.
- Tenant check: a user from another company gets refused when creating or reading that invoice. The existing access check is untouched; this is a read-back only.
- Type check, focused tests, build.

## Not in this fix (flagged for you)
- INV-2026-0004 and the four understated invoices already went out with wrong figures. Correcting or reissuing them is a separate data change needing your approval.
- Invoice status never moving past "unpaid" (BJ-0077) is a separate known bug and is not touched.

## Rollback
Restore the version before this change and redeploy `create-job-invoice` only.
