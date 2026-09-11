# Receipt downloads: no extra tab, plus regenerate KN-2026-1028

## 1. Remove the new tab, keep only the file download

Today tapping "Download PDF Receipt" opens a second tab (a small loading page) and that page does the download. That is why you see both a download and a blob URL tab. The tab goes away entirely.

New behaviour: the button downloads the file straight from the page you are already on.

- While it works, the button shows a "Preparing receipt…" state and stays disabled, so a double tap can never start two downloads.
- On success the file lands in downloads and a short confirmation appears. No navigation, no new tab.
- On failure the existing error wording is shown in a toast (offline, taking too long, unavailable, no access) with the option to tap again.

Where this applies: the receipt page (Office and Engineer), Payment History, and the public receipt page — all three use the same shared code path, so they behave identically.

Old browsers with no download support: instead of a new tab, the PDF opens in the current tab as it did before. This affects only very old browsers; current iPhone and Android Safari/Chrome all download normally.

### Technical notes

- `src/lib/receiptDownload.ts` — replace the `openExternalUrl` tab-open helpers with in-page async helpers that run the existing sequence: `generate-receipt-pdf` (with `payment_amount` when known) then `fetchReceiptPdf` then `downloadReceiptPdf`. Keep the same timeout wrapper (`withRequestTimeout`), the same error classification (timeout / offline / forbidden / generate / resolve) and return a typed result for the caller's toast.
- `src/pages/ServiceReceipt.tsx`, `src/components/customer/PaymentHistory.tsx`, `src/pages/PublicReceipt.tsx` — await the helper, keep the existing in-flight guard, map the result to the existing copy.
- `src/pages/ReceiptDownload.tsx`, `src/pages/PublicReceiptDownload.tsx` and their routes — keep as-is so any already-shared link still works, but nothing opens them any more. Remove the "Open Receipt" blob button from them so no route can open a blob tab.
- No change to `stream-receipt-pdf`, `generate-receipt-pdf`, storage, signed-URL handling, tenant isolation, permissions, receipt numbering, or payment data.
- Tests: extend `src/lib/__tests__/receiptDownload.test.ts` for the new helper's success and each failure classification; keep the existing filename tests.

## 2. Regenerate KN-2026-1028 with the fixed badge

Confirmed: this is K&N job KN-469, receipt KN-2026-1028, already fully paid, with a cached PDF stored from before the badge fix. Regeneration only rewrites that stored PDF file and the stored file path. It sends no WhatsApp, no email and no customer notification, and it does not touch payment records, revenue, status or the receipt number.

One thing needs care: this job has no payment ledger row and no revenue value, so a plain regeneration would print €0.00. So the steps are:

1. Read the amount printed on the current stored PDF.
2. Regenerate passing that exact same amount, so the new PDF is identical to the old one except for the corrected badge.
3. Download the new file and visually confirm the badge reads "Payment Successful" cleanly with no stray character and normal spacing.
4. Re-read the stored file path in the database to confirm the receipt number and path are unchanged.

If step 1 cannot establish the amount, I will stop and report the figure options rather than guess.

## Verification

- Desktop Chrome (normal and Incognito) and Safari: download from the receipt page, Payment History and the public receipt page — file downloads, no second tab, no blob URL in the address bar.
- iPhone Safari and installed PWA: download completes and the app stays usable.
- Weak signal and offline: timeout, offline and retry behave as before; one download per tap.
- One K&N and one Dublin Gas receipt; cross-tenant still fails closed.
- TypeScript, full test suite, no console errors.

## Risk

Low for part 1 (presentation only, fewer moving parts than today). Low for part 2 — it rewrites one PDF file for one already-paid job, with no messaging and no financial writes.
