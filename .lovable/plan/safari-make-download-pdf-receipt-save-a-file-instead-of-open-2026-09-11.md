# Safari: make "Download PDF Receipt" save a file instead of opening the PDF

## What you reported
On iPhone Safari, tapping **Download PDF Receipt** shows the receipt on screen instead of saving a file. Chrome saves it directly.

## Why it happens
The button fetches the receipt file and hands it to the browser with a "save this as a file" instruction. Chrome honours that. Safari on iPhone largely ignores it for PDFs and displays the document instead — this is Safari behaviour, not a fault in the receipt itself.

## Intended behaviour (agreed)
Get as close to Chrome as Safari allows: the tap should end with the receipt saved as a file, not just displayed.

## What will change
1. Keep the current behaviour everywhere it already works (Chrome, Android, desktop) exactly as-is.
2. On iPhone/iPad Safari, the tap will instead open the system **Save / Share** sheet with the receipt file attached, so the engineer or office user can tap "Save to Files" (or send it on) in one step. This is the only way iOS lets an app hand over a real file.
3. If that sheet isn't available on the device, fall back to today's behaviour (receipt shown on screen) rather than a dead tap.
4. Success and error messages stay as they are now, including offline and weak-signal wording. Cancelling the Save sheet will not show an error.

No change to how receipts are generated, who can see them, amounts, receipt numbers, payments, or messaging. Still no extra browser tab.

## Technical detail
- `src/lib/receiptPdfStream.ts`: add an iOS-Safari branch to the existing `downloadReceiptPdf` path. Order: `navigator.canShare({ files: [File] })` → `navigator.share` with the PDF `File`; else existing anchor-download; else `openReceiptPdfBlob` same-tab fallback. Treat `AbortError` from `share` as a non-error (user cancelled).
- Detection stays presentation-only and mirrors the existing UA/standalone checks used in `src/components/pwa/InstallAppBanner.tsx` and `src/lib/sentryContext.ts` (iOS UA, including iPadOS-as-Mac with touch points).
- `src/lib/receiptDownload.ts` gains no new failure kinds; `downloadJobReceipt` / `downloadPublicReceipt` signatures and `receiptDownloadCopy` unchanged. A cancelled share resolves as `{ ok: true }` with no toast text change beyond suppressing the "downloaded" confirmation.
- Callers untouched: `ServiceReceipt.tsx`, `PaymentHistory.tsx`, `PublicReceipt.tsx`, and the two legacy download routes.
- Tests in `src/lib/__tests__/receiptPdfStream.test.ts` extended for: iOS + shareable files → share called with a PDF `File`; iOS without share support → anchor download; non-iOS → unchanged anchor download; `AbortError` → no failure.

## Verification
- Full Vitest suite plus TypeScript check.
- Confirm non-Safari path is byte-for-byte unchanged in behaviour (existing tests must pass untouched).
- Device check on your iPhone after publish: tap Download PDF Receipt on a receipt page, confirm the Save sheet appears with `receipt-....pdf` and that "Save to Files" produces the file.
