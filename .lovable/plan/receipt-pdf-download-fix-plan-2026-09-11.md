# Receipt PDF download fix plan

## Confirmed diagnosis

- **What happens:** the shared `Download PDF Receipt` button waits for one or two network requests and only then tries to open a new tab. Desktop Chromium opened the PDF successfully, but this delayed tab-opening pattern can be blocked once iPhone Safari/PWA no longer considers it part of the original tap. To the user, the tap appears to do nothing.
- **End-to-end path:** Office and Engineer both reach the same `ServiceReceipt` screen. It reuses or generates the PDF through `generate-receipt-pdf`, stores the file in the private `certificates` storage area under the job's organisation, saves the storage path on the job, then calls `resolve-document-link` for a one-hour signed URL.
- **Tenant check:** signed-link resolution returned HTTP 200 for existing K&N and Dublin Gas receipts through each tenant's own domain. Storage paths are organisation-prefixed, and PDF branding/settings are selected by the job's organisation. No tenant-specific failure was found.
- **Connection sensitivity:** existing PDFs still require the signed-link request. Missing PDFs require generation plus signing. Neither request in this button flow has a bounded timeout, and errors are collapsed into one generic message. Weak signal can therefore leave the tap apparently stalled; this is separate from, but compounds, the iPhone delayed-open problem.
- **Workspace check:** Office and Engineer use the same button and handler, so the defect affects both. Office Customer Payment History has a similar delayed-open flow, while the public receipt page has an additional confirmed defect: it links the raw private storage path directly instead of resolving a signed URL.

## Proposed implementation

1. Open a same-origin loading tab synchronously from the original tap, then direct that already-open tab to the signed PDF after generation/resolution. This preserves the iPhone Safari/PWA user gesture while keeping the receipt screen open; failed requests close or replace the loading tab with a clear retry state.
2. Add an immediate loading/disabled state to prevent duplicate taps, bound both generation and signed-link resolution, and distinguish generation, signing, timeout, and offline failures with a retryable message.
3. Reuse the same safe receipt-opening helper from the shared receipt screen and Office Customer Payment History.
4. Correct the separate public receipt button so it never treats a raw private storage path as a URL. Resolve it through a narrowly scoped server-side signed-link path without weakening the existing receipt access model.
5. Add regression tests for existing-PDF, generate-then-open, timeout/offline, missing token, and repeated-tap behavior.

## Verification

- Test Office and Engineer receipt downloads at 320px, 390px, and desktop widths.
- Test one scratch receipt in K&N and one in Dublin Gas, both with an existing PDF and with generation required.
- Test normal connection, throttled weak connection, offline failure/retry, iPhone Safari, and installed PWA mode.
- Confirm one tap causes at most one generation, the correct PDF opens, the app remains recoverable, no cross-tenant path is accepted, and there are no console errors.

## Scope

No payment, receipt amount, WhatsApp, permissions, tenant-isolation, routing, or PDF-content logic changes.
