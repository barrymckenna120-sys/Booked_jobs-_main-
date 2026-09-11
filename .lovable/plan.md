# Receipt PDF delivery and badge repair plan

## Confirmed findings

- Office, Engineer, Payment History, and public receipt downloads currently end by replacing the loading page with a one-hour signed `supabase.co/storage/.../certificates/...pdf` URL. The address-bar change is therefore expected, and `ERR_BLOCKED_BY_CLIENT` is consistent with a local extension or privacy filter; Incognito testing is still needed to confirm the reporter’s specific blocker.
- The literal `certificates` bucket name is not used by any application blocklist, security rule, or browser policy found in the repository. Renaming it would be a risky storage migration without addressing the more likely third-party-host filtering.
- A true same-origin byte stream cannot be provided by the current static frontend alone. The smallest available fix is a protected Edge Function that reads the private object server-side and returns the PDF bytes, while the existing loading page remains on the tenant domain. This removes the raw Storage URL and `certificates` path from the browser navigation. The browser network request to the function still uses the backend host unless an external reverse proxy/custom function domain is added later.
- The broken badge is generated once for every tenant in `generate-receipt-pdf`. It draws the Unicode checkmark with jsPDF’s built-in Helvetica font, which does not support that glyph; the malformed substitution also disturbs text measurement. K&N and Dublin Gas share this exact renderer. Their branding data differs, not the badge template.

## Implementation

1. **Add a narrowly scoped receipt PDF streaming function**
   - Reuse the existing receipt lookup, tenant-origin binding, access-token/public-receipt rules, and private storage-path extraction.
   - Authenticate Office/Engineer requests through the existing verified session and resource-organisation check; preserve the current domain-bound public receipt-number path.
   - Download the object server-side and return bytes as `application/pdf` with a sanitized receipt filename, explicit `Content-Disposition`, private/no-store caching, full CORS headers, and fail-closed error responses.
   - Accept only the two existing receipt identifiers; never accept a bucket or arbitrary object path from the browser.

2. **Keep the browser on the BookedJobs receipt page**
   - Replace signed-URL navigation in the two receipt download pages with the streamed PDF response and a browser blob URL.
   - Preserve the immediate same-origin tab opening, exact payment amount regeneration, duplicate-tap prevention, weak-signal timeout, retry, close behavior, and public receipt flow.
   - Revoke temporary blob URLs after use and distinguish generation, authorization/not-found, timeout, offline, and blocked-download failures.

3. **Repair the PDF badge**
   - Remove the unsupported Unicode checkmark from the Helvetica text run.
   - Draw the check as two vector strokes and render `Payment Successful` as a separate centered text run with normal spacing.
   - Keep the existing green badge, dimensions, wording, amounts, receipt content, and tenant branding behavior unchanged.

4. **Handle existing PDFs explicitly**
   - Confirm the generator fix with newly generated scratch receipts for K&N and Dublin Gas.
   - Existing stored PDFs will not change automatically because the generator deliberately reuses cached files. Regenerating receipt `KN-2026-1028` (and any other named affected receipt) will be a separate, review-gated action after the code is deployed; it will not send customer messages.
   - Do not rename or migrate the `certificates` bucket unless Incognito and extension-specific testing proves the literal path keyword is independently blocked.

## Verification

- Chrome normal profile versus Incognito with the reported extension disabled/enabled; record whether the block is extension-specific.
- Confirm the address bar remains on the K&N or Dublin Gas domain while the PDF opens/downloads and no raw Storage URL appears in navigation.
- Test authenticated Office and Engineer downloads, Payment History, and public receipts for both K&N and Dublin Gas; verify cross-tenant attempts fail closed.
- Test existing PDF, generate-then-open, exact partial/full payment amount, repeated tap, offline, throttled timeout, expired/invalid token, and missing object.
- Render new K&N and Dublin Gas PDFs to images and visually inspect the badge, text spacing, amount, branding, clipping, and filename. Add regression tests for identifier validation, tenant checks, response headers, and download state handling.
- Run TypeScript checks, targeted tests, full tests, and confirm no browser console errors.

## Scope and risk

This changes receipt delivery and the badge drawing only. It does not alter payment calculations, payment status, receipt numbering, customer messaging, permissions, tenant ownership, or other document types. Risk is **medium** because the delivery endpoint handles private customer documents; tenant isolation and fail-closed authorization require full security verification.
