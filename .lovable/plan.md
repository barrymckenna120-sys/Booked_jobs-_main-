# Deploy the corrected job-invoice balance

## Final change before deployment
- Change the invoice PDF label from **Deposit Paid** to **Payments received**.
- Change the matching WhatsApp line from **Deposit paid** to **Payments received**.
- Make no calculation, template, route, or other wording changes.
- Keep the office preview aligned by using **Payments received** there as well, because it displays the same all-payments figure.

## Deployment sequence
1. Run the focused invoice tests and confirm the preview build is healthy.
2. Record the currently deployed `create-job-invoice` version as the exact rollback target.
3. Deploy **only** `create-job-invoice`; do not deploy any other function.
4. Immediately tell Barry to click **Publish → Update** so the frontend invoice-preview change is released alongside the function. The function deployment is immediate; the frontend does not become public until Update is clicked.
5. Do not send any customer WhatsApp messages during verification.

## K&N TEST verification only
Use organisation `c0aa41ac-41ab-42d8-8085-972c072b0279` and scratch records only.

- **Preview and PDF agreement:** open the invoice preview in the browser, create/open the test PDF without sending it, and confirm both show the same total, Payments received, and balance due. Read back the invoice record and confirm its balance matches.
- **Missing price:** use a scratch job with no price and no linked quote. Confirm the preview visibly shows **“Set a job price before invoicing”**, and confirm the deployed creator refuses the request with that same error.
- **Deposit plus part-payment:** use a scratch job with both payments recorded in the payment ledger. Confirm the preview, generated PDF, and invoice record all show the same correct remainder, with both payments subtracted once.
- Check the deployed function logs and relevant invoice data after each test. Confirm no customer message was sent.
- Do not inspect, edit, recreate, reissue, or message **INV-2026-0008 (Aisling Power)**.

## Separate issue to record only
- Add a new backlog item for **“two different TOTAL lines on quote-job PDFs”**.
- Record it as a separate investigation/fix; do not alter quote-job PDF code in this deployment.

## Rollback
- Report the exact pre-deployment function version before deploying.
- If rollback is needed, restore the application source version from immediately before this invoice change and redeploy only the recorded prior `create-job-invoice` function version.
- Publish the restored frontend only if the invoice-preview frontend change also needs to be rolled back.

## Final report
- Deployed function and version, plus the previous rollback version.
- When Barry should click **Publish → Update**.
- PASS/FAIL for each K&N TEST check, including the browser-visible result, PDF values, invoice-row values, and no-message confirmation.
- The separate quote-job PDF bug reference.
- Explicit confirmation that INV-2026-0008 was untouched.