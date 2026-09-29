# Fix stale address/phone in WhatsApp footer (TEST K&N org)

## Root cause (confirmed from data and code)

- The footer is **frozen text**. When Super Admin creates a business, `provision-tenant` (lines 250-266) builds `settings.message_footer` once as `name | address | phone` and saves that text.
- TEST K&N (`c0aa41ac…`) has `message_footer = "K&N gas services Ltd | 12 Beechdale Road | 0872354257"`. Its current Business Information is address **blank**, phone **0873685252**. Nothing rebuilds the footer when Business Information is saved, so the old address and phone stay in it.
- There's a second stale copy: `settings.company_phone = 0872354257`, which was also written at creation. Business Information only edits `business_phone`, so `company_phone` never changes. `send-schedule-confirmation` reads `company_phone`.
- Nothing is hardcoded: "12 Beechdale" and "0872354257" appear only in test fixtures. Real K&N (`8c37827f…`) is unaffected. Its footer is just "K&N Gas Services".
- Super Admin name: the business name entered at creation is saved as `business_name`, `company_name` and `organisations.name`, and it shows up in Business Information ("K&N gas services Ltd"). That part works.

## Fix (1 file: Business Information save)

When Business Information is saved, also rebuild the footer and sync the phone in the same update:
- Footer = **the name part already in the footer, kept as-is** + the current saved address + the current saved phone, joined with " | ". Blank parts are dropped, so a deleted address disappears.
- `company_phone` gets the same value as `business_phone`.
- The name part is left alone, so the WhatsApp name and the receipt/quote name (`business_name`) don't change.

No database structure changes, no message-function changes, no changes to access rules. The update stays limited to the signed-in user's own organisation, as it is now.

## Name discrepancy to confirm

The brief says WhatsApp shows **"KN Gas Services"** and receipts show **"KNGas Services Ltd"**. The saved values are actually **"K&N gas services Ltd"** in both places. I will not change any name. If those exact spellings are required, that's a separate data change for you to approve.

## Verification (TEST K&N org only)

1. Change the address and phone in Business Information, then read back the footer and `company_phone`.
2. Clear the address and confirm "12 Beechdale Road" is gone.
3. Dry-build a WhatsApp message (no real send) and confirm the new footer is used.
4. Refresh and confirm the values persist. Confirm the name is unchanged on receipts and quotes.
5. Confirm Dublin Gas and real K&N settings are unchanged. Confirm the other-tenant read is still blocked.
6. Add a unit test for the footer-building rule. Run the test suite, typecheck and build.

## Out of scope

Existing footers for other tenants are not backfilled. A tenant's footer rebuilds the next time they save Business Information.
