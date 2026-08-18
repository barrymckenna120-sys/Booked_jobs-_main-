# Receipt PDF / receipt-number mismatch — findings and next steps

## Part 1 — Original question (KN-482, receipt KN-2026-9317): closed

- `service_calls.customer_facing_notes` is **NULL** — not an empty string, no text. The note was never written for this job.
- `get_receipt_public('KN-2026-9317')` returns the key with a null value: `"customer_facing_notes": null`, alongside `receipt_show_boiler_details: true`, `boiler_brand: "Vaillant"`, `boiler_model: "ecoFIT Pure"`, `next_service_due: "2027-08-18"`, `gprn: "G123422"`, `warranty_expiry_date: null`.
- Conclusion: the missing Notes box is correct behaviour, not a bug. No preview-vs-live or stale-cache question applies to the note.

## Part 2 — The real defect found: PDF file does not match the receipt

KN-482's receipt number is `KN-2026-9317`, but its `receipt_pdf_url` points at
`receipt-KN-2026-3263.pdf` — a different receipt number. That storage object was
created at 12:38:34 UTC and never updated, i.e. before KN-482 was completed and
its current receipt number was issued at 15:22 UTC. So the "Download PDF Receipt"
button serves a stale file.

Scope across all tenants: **13 of 59 jobs** with a stored receipt PDF have a
path whose receipt number does not match the job's current `receipt_number`.
All 13 referenced files do exist in storage, so customers get *a* PDF — just
possibly the wrong one.

```text
job      receipt_number   pdf file            file's other owner
KN-482   KN-2026-9317     KN-2026-3263        -
DG-397   DG-2026-4500     DG-2026-2099        -
KN-405   KN-2026-3357     KN-2026-1189        -
DU-004   DG-2026-1117     DG-2026-4892        -
DG-373   DG-2026-8113     K-182               -   (K&N-style number in DG org path)
KN-315   K-002            K-001               KN-047  <-- another job's receipt number
KN-316   K-004            K-003               KN-045  <-- another job's receipt number
KN-231/234/235/245/253/326  K-15x/16x/17x     off-by-one   -
```

Two rows (KN-315, KN-316) point at a filename that is *another job's* receipt
number. Whether the file content belongs to that other customer is not yet
confirmed — that is the one item with possible data-exposure impact and needs
checking before anything else.

### Likely cause (to be confirmed, not yet proven)

`generate-receipt-pdf` short-circuits and returns early whenever
`service_calls.receipt_pdf_url` is already set, and it names the file from the
`receipt_number` present *at generation time*. If a job is completed a second
time, `generate_receipt_number` issues a fresh number but the PDF is never
regenerated, so the old filename sticks. The off-by-one `K-15x` cluster looks
like a separate, older numbering-sequence issue rather than the same path.

## Proposed next pass (read-only, no code or data changes)

1. Render the two suspicious PDFs (`K-001`, `K-003`) and confirm whose customer
   name and address they contain — is any customer's receipt showing another
   customer's details?
2. Confirm the re-completion theory for KN-482 and DG-397 by reading their
   completion/receipt history, rather than assuming it.
3. Classify the 13 rows into: harmless off-by-one legacy numbering vs. genuinely
   wrong content, and report which customers were actually sent a wrong link.

Only after that would we decide on a fix (regenerate the affected PDFs, and stop
the generator short-circuiting when the stored filename no longer matches the
job's receipt number).

## Technical notes

- Evidence gathered by SQL reads only against `service_calls`, `settings` and
  `storage.objects`, plus one anonymous call to the public `get_receipt_public`
  RPC. Nothing was written.
- Cosmetic pre-existing nit, unrelated: the PDF success badge renders `'`
  instead of a tick because jsPDF's Helvetica lacks the glyph.
