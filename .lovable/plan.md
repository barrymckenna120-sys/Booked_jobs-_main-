# Receipt footer: match the mockup + explain why it looked empty

## Part 1 — Why the test showed nothing (confirmed, no action needed)

The code is present and correct (`generate-receipt-pdf` L42, L63, L181-245; `PublicReceipt.tsx` L60-87, L154-170). But:

- The function has **zero logs** — no boot, no invocation, no error — since the 2026-08-13 change, i.e. never redeployed.
- 5 of the last 8 receipts already have a stored `receipt_pdf_url` written 2026-08-12, before the change, so they serve the old PDF and never re-run the generator.
- Almost no data exists to render: `customers.warranty_expiry_date` 0 of 94, `customers.gprn` 14 of 94, `service_calls.customer_facing_notes` NULL on every recent receipt job.

No code fix needed for this part.

## Part 2 — Restyle the footer to the mockup

Apply the mockup's visual treatment to the existing section in `src/pages/PublicReceipt.tsx`, keeping the current data wiring and hide rules unchanged:

- Two-column grid below the payment block: **Boiler Details** left (plain, no border), **Notes** right (boxed).
- Each left row gets a small Lucide icon with the mockup's hierarchy — tiny bold uppercase grey label above a semibold value: Make & Model (Wrench), Warranty (Shield / ShieldOff), Next Service Due (Calendar), GPRN (Hash).
- Warranty in force renders in the success colour as `Under Warranty (until <date>)`; expired renders muted as `Warranty Expired`; absent hides the row.
- Notes box: soft tinted background, thin border, rounded corners, `MessageSquare` icon beside wrapped note text. Column heading right-aligned.
- Empty states: `No details on file` when the left column has nothing; `—` when there are no notes. The whole section hides only when both columns are empty.
- Colours come from existing semantic tokens (success, primary/accent tint, muted-foreground) rather than the mockup's literal slate/blue/emerald classes. Where no token fits (e.g. the notes tint), use the nearest existing token and flag it in the response — no new CSS variables added silently.

The **PDF keeps its current layout**: same rows, same order, same wording, same hide rules, no icons, existing grey note box. Screen and PDF stay consistent in content, not pixel-identical in decoration.

## Part 3 — Prove it renders

1. Redeploy `generate-receipt-pdf` (no code change there) and confirm a boot entry appears in its logs.
2. On one scratch K&N job with a NULL `receipt_pdf_url` (K-045), set the customer's `warranty_expiry_date` and `gprn` and the job's `customer_facing_notes` to realistic test values. Confirm the on-screen receipt and a freshly generated PDF both show both columns correctly.
3. Repeat on one Dublin Gas job with a NULL `receipt_pdf_url` using equivalent test data, confirming it renders correctly cross-tenant.
4. Eyeball the two empty-ish states on screen — no boiler record, and no notes — confirming the hide/empty-state rules from Part 2.

Receipts that already have a stored PDF are left untouched; regenerating would overwrite documents customers may already hold. A back-fill, if wanted, is flagged separately and not done here.
