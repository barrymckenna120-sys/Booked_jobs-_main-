# Receipt footer: match the mockup + explain why it looked empty

## Part 1 — Why your test showed nothing (audit findings, confirmed)

1. **The code is there.** `generate-receipt-pdf` selects `customer_facing_notes` (L42) and `boiler_brand, boiler_model, warranty_expiry_date, next_service_due, gprn` (L63) and draws the two-column section at L181-245. Last changed 2026-08-13 14:42 UTC. The on-screen version exists too (`src/pages/PublicReceipt.tsx` L60-87, L154-170).
2. **Deployment unconfirmed.** There are **zero logs** for `generate-receipt-pdf` — no boot, no invocation, no error — while other functions log normally. Consistent with never having been redeployed since 08-13.
3. **Stored-PDF short-circuit.** 5 of the 8 most recent receipts already have a `receipt_pdf_url` written 2026-08-12, before the code change, so they serve the old PDF and never re-run the generator. Only K-162, K-045, K-084 have a NULL url.
4. **Almost no data to render.** `customers.warranty_expiry_date`: 0 of 94 populated. `customers.gprn`: 14 of 94. `service_calls.customer_facing_notes`: NULL on every recent receipt job. So even a fresh, correctly deployed PDF renders only Make & Model + Next Service Due — single column, no Notes box.

## Part 2 — Restyle the footer to the uploaded mockup

Apply the mockup's visual treatment to the existing section on `PublicReceipt.tsx`, keeping the current data wiring and hide rules:

- Two-column grid below the payment block: **Boiler Details** left (plain, no border), **Notes** right (boxed).
- Each left row gets a small Lucide icon and the mockup's label/value hierarchy: tiny bold uppercase grey label above a semibold value — Make & Model (Wrench), Warranty (Shield / ShieldOff), Next Service Due (Calendar), GPRN (Hash).
- Warranty in-force renders in the success colour with `Under Warranty (until <date>)`; expired renders muted as `Warranty Expired`; absent hides the row.
- Notes box: soft blue tinted background, thin blue border, rounded, `MessageSquare` icon beside wrapped note text. Column heading right-aligned.
- Empty states from the mockup: `No details on file` when the left column has nothing, `—` when there are no notes. Section hides entirely only when both are empty.
- All colours go through existing semantic tokens (success, primary/accent tint, muted-foreground) rather than the mockup's literal slate/blue/emerald classes, so theming stays intact.

Icons and the tinted note box do not translate cleanly to jsPDF, so the **PDF keeps its current layout** — same rows, same order, same wording and same hide rules — just without icons and with the existing grey note box. Screen and PDF stay consistent in content, not pixel-identical in decoration.

## Part 3 — Prove it renders

1. Redeploy `generate-receipt-pdf` (no code change needed there) and confirm a boot appears in its logs.
2. On one scratch job with a NULL `receipt_pdf_url` (K-045), set the customer's `warranty_expiry_date` and `gprn` and the job's `customer_facing_notes` to realistic test values, then check the on-screen receipt and a freshly generated PDF show both columns.
3. Also eyeball the two empty-ish states (no boiler record, no notes) on screen.

Existing receipts that already have a stored PDF are left untouched — regenerating would overwrite documents customers may already hold. Say the word if you want a separate back-fill.
