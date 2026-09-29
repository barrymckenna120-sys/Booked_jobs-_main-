# Undo footer rebuild — WhatsApp footer = trading name only

Scope: undo the footer rebuild only. Nothing else changes.

## 1. Code (one commit)
- `src/lib/messageFooter.ts`: delete `rebuildMessageFooter`. `buildContactSyncPatch` returns only `{ company_phone }` (trimmed phone, or null).
  - The input type keeps the optional `existingFooter` / `businessName` / `address` fields, which the function now ignores. That lets `GeneralTab.tsx` stay byte-identical and still compile. Its phone sync keeps working.
- `src/pages/admin/TenantDetail.tsx` (~line 421): change the lookup back to `.select("id")`. Call `buildContactSyncPatch({ phone })` only, without footer or address.
- Tests (`messageFooter` test file): remove the footer tests and keep the company_phone tests. Add one test that the returned object has no `message_footer` key.

## 2. Data (a separate step that needs your review)
1. SELECT `organisation_id, business_name, message_footer` from settings for `8c37827f-ce2c-4507-a821-a5e807d89856` and `c0aa41ac-41ab-42d8-8085-972c072b0279`, and show you the output.
2. UPDATE only those two orgs: `message_footer = 'K&N Gas Services'` and `business_name = 'K&N Gas Services Limited'`. No other columns and no other orgs change.
3. Run the same SELECT again and show you the before and after. Also confirm the row count for all other orgs is unchanged.

## 3. Evidence
- The commit hash on origin/dev, if I can check it. If I can't, I'll report the working-branch hash and say so.
- Focused test count, full suite count and the typecheck result.
- TEST K&N only:
  - Send one booking confirmation on a scratch job with a test number (never a real customer). Paste the footer line from `message_log`.
  - Generate one receipt PDF and one quote PDF on TEST K&N records. Confirm the header reads "K&N Gas Services Limited" using the PDF text or a screenshot.

## Notes
- Real K&N receives the data change only. No messages or PDFs will be generated on real K&N.
- The `send-booking-confirmation` function is not changed, so no redeploy is needed.
