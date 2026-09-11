# Receipt PDF: direct download instead of blob tab-open

## Answer to the two points

- The block you hit was on the preview host, so it is not clean evidence about the published tenant domains. Re-testing on the live site (and in Incognito) is still the right way to confirm whether an extension is responsible.
- Switching to a direct file download is safe and does not conflict with the iPhone-safe pattern. The gesture-safe part is opening the same-origin loading page from the tap; that stays exactly as it is. Only the final step inside that already-open page changes: instead of navigating the page to a blob URL, it hands the PDF to the browser as a download.

## What changes

1. In the shared receipt PDF helper, replace "navigate this page to the blob" with "trigger a download of the blob":
   - Create a temporary anchor with the blob URL and a `download` attribute set to the receipt filename (e.g. `receipt-KN-2026-1028.pdf`), click it, remove it, then revoke the blob URL shortly after.
   - Keep the existing `pagehide` revoke as a safety net so no blob URL leaks.
2. Add a small fallback: if the browser does not support the `download` attribute (older iOS standalone cases), fall back to the current blob navigation so no one ends up with a dead tap.
3. Give the loading page a finished state instead of leaving a spinner forever: after the download is handed off, show "Receipt downloaded" with an "Open receipt" button (blob navigation) and a "Close" button, reusing the existing buttons and copy style.
4. Everything already built stays untouched: synchronous same-origin open from the tap, duplicate-tap prevention, bounded timeouts, offline/timeout/forbidden/generate error states, retry, exact payment amount regeneration, and the public receipt route behaviour.

## Files

- `src/lib/receiptPdfStream.ts` — add `downloadReceiptPdf(pdf, filename)`; keep `openReceiptPdfBlob` as the fallback and manual-open action; derive the filename from the receipt number.
- `src/pages/ReceiptDownload.tsx` and `src/pages/PublicReceiptDownload.tsx` — call the download helper, add the "downloaded" state with Open/Close.
- `src/lib/__tests__/receiptPdfStream.test.ts` — tests for filename building and download-vs-fallback selection.

No Edge Function, storage, payment, receipt-numbering, tenant-isolation, or permission changes. The streaming function and its headers stay as deployed; `Content-Disposition` already carries a sanitized filename.

## Verification

- Desktop Chrome (normal profile and Incognito) and Safari: tap Download PDF Receipt from Office, Engineer, Payment History, and the public receipt page; confirm the file downloads with the correct receipt filename and no raw storage URL appears.
- iPhone Safari and installed PWA: confirm the download completes and the app remains usable, with the Open fallback working.
- Weak signal and offline: confirm timeout, offline, retry, and one-generation-per-tap behaviour are unchanged.
- One K&N and one Dublin Gas receipt each; confirm cross-tenant still fails closed.
- TypeScript, full test suite, no console errors.

## Risk

Low. Presentation-layer delivery change only, with a fallback path retained.
