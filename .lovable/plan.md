# Fix receipt PDF download links (Payment Activity + Service Receipt)

Both screens open the raw storage path stored in `receipt_pdf_url` (e.g. `<org_id>/receipt-KN-2026-2325.pdf`), which the browser treats as an in-app route and lands on the NotFound page. The WhatsApp/redirect flow already works because it mints a short-lived signed URL through the existing `resolve-document-link` function.

## What changes

**1. Shared helper (new, small): `src/lib/resolveReceiptUrl.ts`**
- Takes a job's `access_token`, calls `resolve-document-link` with `{ type: "receipt", token }`, returns `signed_url` or `null`.
- Same call shape as `ReceiptRedirect.tsx`, so no server-side change is needed.

**2. `src/components/customer/PaymentHistory.tsx`**
- Add `access_token` to the existing `select(...)` for receipt rows.
- `handleDownload`: fallback order stays exactly as-is (stored `receipt_pdf_url` → fresh `generate-receipt-pdf` → `/receipt-view/:id`). Only the "open" step changes: once a path exists (stored or freshly generated), resolve a signed URL first and open that. If resolution fails, fall through to `/receipt-view/:id` rather than opening a raw path.

**3. `src/pages/ServiceReceipt.tsx`**
- `handleDownloadPdf`: after `generateReceiptPdf()` confirms a PDF exists, resolve the signed URL via the same helper and pass that to `openExternalUrl`. Keep the existing destructive toast when nothing can be resolved.

## Out of scope
- No changes to `SalesLedger.tsx`, `resolve-document-link`, `signDocumentUrl`, or the WhatsApp receipt flow.
- No database writes; no changes to `receipt_pdf_url` values.
- Filename / receipt-number mismatch left alone (separate data issue).

## Notes
- `service_calls.access_token` exists and is what the receipt resolver keys on, so signing works for both stored and freshly generated paths.
- Signed URLs last 1 hour, matching the existing document-link convention.
