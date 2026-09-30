# BJ-0133 H: Zero-invoice rule

## The gap today
`create-job-invoice` only checks the job price when there is **no** linked quote (`index.ts:101`). If a job has a quote, it trusts `quote.total_amount` (`index.ts:118`) with no check, so a quote totalling €0, blank or negative can still create an invoice.

## Change (one file: `create-job-invoice/index.ts`, plus the shared helper)
- Add `isInvoiceableTotal(total)` to `_shared/invoiceBalance.ts`. It returns true only when the total is a real number above 0.
- In the creator, after working out `totalAmount` (from the quote or the job price) and **before the invoice row is inserted** (`index.ts:133`), refuse with HTTP 422 `"Set a job price before invoicing"` when the check fails. Nothing gets written.
- The existing no-price/no-quote check stays as it is.
- A total above 0 with a balance of 0 (paid in full) is still allowed. Nothing about balances changes.
- Office preview: use the same helper so it shows the same red error and blocks Send/Download for a zero or negative quote total. This is only a frontend change, so it needs **Publish → Update**.

## Tests
- Unit tests for the helper: null, blank, not a number (`"abc"`, NaN) and 0 are refused; −50 is refused; 0.01 and 500 are allowed.
- Live check on K&N TEST (`c0aa41ac…`) only, using scratch records with an opted-out customer, so no WhatsApp message goes out:
  - price missing → 422, no invoice row
  - price 0 → 422, no invoice row
  - price negative → 422, no invoice row
  - quote total 0 → 422, no invoice row
  - price €160 with €160 in payment history → 200, invoice total 160, balance 0; PDF shows Balance Due €0.00
- Afterwards: check the function logs, check there are no `message_log` rows for the scratch customer, then delete the scratch data by its IDs. INV-2026-0008 is not touched.
- Deploy only `create-job-invoice`. Before deploying, record the current source revision as the rollback point.

## Every code path that creates an invoice (confirmed by search)
| # | Path | file:line | Goes through create-job-invoice? |
|---|---|---|---|
| 1 | The only place an invoice row is inserted | `supabase/functions/create-job-invoice/index.ts:133` | Yes, this is the creator itself |
| 2 | Office invoice preview, Send | `src/pages/InvoicePreview.tsx:140` | Yes |
| 3 | Engineer Job Detail, complete with Invoice | `src/pages/engineer/EngineerJobDetail.tsx:668` → `src/lib/createJobInvoice.ts:8` | Yes |
| 4 | Engineer job card, complete with Invoice | `src/hooks/useEngineerJobs.ts:737` → `src/lib/createJobInvoice.ts:8` | Yes |
| 5 | `send-payment-received` | `supabase/functions/send-payment-received/index.ts:113` | Only reads the latest invoice number. It does not create an invoice |

No other function, and no database migration or trigger, writes new rows to `invoices`.

**Not verifiable from the code: Make.com.** Make scenarios are not stored in this project. If a Make scenario writes to `invoices` directly through the database API, it would skip this rule. The report will flag this and leave it unfixed. To confirm it, check the Make scenarios for any `invoices` insert, or look at who created recent invoice rows that have no matching `create-job-invoice` log entry.

## Report back
The files changed, the test results, PASS/FAIL for each of the five live checks with the HTTP status and invoice-row readback, confirmation that no messages were sent, the rollback revision, the path table above, and the Make.com caveat.
