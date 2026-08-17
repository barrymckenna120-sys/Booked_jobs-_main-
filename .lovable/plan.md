# Receipt PDF: audit findings and the fix that follows

## Findings (read-only, confirmed)

1. **Code is present.** `supabase/functions/generate-receipt-pdf/index.ts` selects `customer_facing_notes` (L42) and `boiler_brand, boiler_model, warranty_expiry_date, next_service_due, gprn` (L63), and draws the two-column BOILER DETAILS / NOTES section at L181-245, after the Total Paid box. Last code change: 2026-08-13 14:42 UTC.

2. **Deployment unconfirmed.** There are **no logs at all** for `generate-receipt-pdf` — no boot, no invocation, no error. Every other recently used function has logs. This is consistent with the function never having been redeployed since the 08-13 change (and definitely not invoked recently).

3. **Short-circuit is in play.** Of the 8 most recent receipts, 5 already have `receipt_pdf_url` set, all written 2026-08-12 — i.e. before the code change. Those serve the old stored PDF and never re-run the generator. Only K-162, K-045 and K-084 have a NULL `receipt_pdf_url` and would generate fresh.

4. **There is barely any data to show anyway.**
   - `customers.warranty_expiry_date`: **0 of 94 rows populated** — the Warranty row can never render.
   - `customers.gprn`: 14 of 94.
   - `service_calls.customer_facing_notes`: NULL on every recent receipt job — the Notes box can never render.
   - Boiler brand/model and `next_service_due` are populated on all candidates.

   So even a correctly deployed, freshly generated PDF currently shows only "Make & Model" and "Next Service Due" (plus GPRN for 14 customers), single-column, no Notes box.

**Conclusion:** both your guesses hold. #2 (not deployed) is the primary suspect given zero logs; #3 (stored PDF short-circuit) independently blocks all five pre-existing receipts. #4 means the section will look near-empty regardless until data exists.

## Proposed fix (for approval)

1. Redeploy `generate-receipt-pdf` with no code change, and confirm from the logs that a boot appears.
2. Pick one fresh receipt with a NULL `receipt_pdf_url` (K-045), populate that customer's `warranty_expiry_date` and `gprn` and the job's `customer_facing_notes` with realistic scratch values, invoke the function, and visually verify the generated PDF shows both columns.
3. Report whether the pre-existing receipts should be left as-is (current behaviour) or regenerated. No regeneration or back-fill happens without a separate decision — regenerating overwrites documents customers may already hold.

Nothing is changed in the receipt layout, the on-screen receipt, or any other function.
