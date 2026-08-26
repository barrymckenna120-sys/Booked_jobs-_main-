# Fix partial-payment record links

## Goal
Make the WhatsApp link sent after a deposit/part payment open a valid payment record immediately, while keeping the final-settlement receipt behavior unchanged.

## Implementation
- Add a regression-tested helper for the partial-payment proof flow.
- Generate/update the payment PDF before composing the part-payment WhatsApp link, using the verified webhook payment amount.
- Include the `/receipt/<access-token>` link only when PDF generation succeeds; otherwise send the confirmation without a broken link and log the failure.
- Deploy the affected payment webhook function.

## Verification
- Run focused backend tests for part-payment messaging and webhook behavior.
- Reprocess/regenerate the DG-900 €5 payment record without creating another payment or sending duplicate reconciliation events.
- Open the public link and verify it resolves to a signed PDF showing €5.00.

## Risk
High: payment webhook path. Changes are limited to post-reconciliation document generation and messaging; payment totals and settlement decisions remain untouched.
