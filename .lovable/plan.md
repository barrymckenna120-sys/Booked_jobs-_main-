# WhatsApp footer rebuild — revised with requested changes

## Q1 — Is the footer editable anywhere, or written by other code? (read-only answer)

- **Not editable by users anywhere.** The only screen that shows it is Settings → Messaging → "Message Footer" (`src/components/settings/WhatsAppTab.tsx:137-142`), and that box is `readOnly`. The tab never calls save (`WhatsAppTab.tsx:107` takes only `settings`, no `onSave`). So there are no user-typed footers to overwrite. The STOP condition does not apply.
- **Written by:**
  - `supabase/functions/provision-tenant/index.ts:256-260` builds it, and `:800` saves it when a business is created.
  - `src/components/settings/GeneralTab.tsx:289-290` is the rebuild on Business Information save. It was added in the previous turn and is **not yet verified live**.
- No other code or edge function writes `message_footer`.
- **Related gap (not a footer write):** Super Admin → Tenant detail saves `business_phone` (`src/pages/admin/TenantDetail.tsx:416`) but doesn't rebuild the footer or sync `company_phone`. I'm reporting this only and leaving it out of scope.

## Q2 — Everything that reads these fields

**message_footer**
- Frontend: `PartsArrivedModal.tsx:40,48` · `WhatsAppTab.tsx:118` · `admin/MessagingCatalogueTab.tsx:86`
- Edge functions: `quote-accepted-alert:55,63` · `send-payment-link:214,218` · `send-whatsapp-receipt:94,110` · `send-part-arrived:136,141` · `send-upcoming-reminders:95,101` · `send-schedule-confirmation:93` · `send-reschedule-notification:86,91` · `generate-receipt-pdf:94` · `send-booking-confirmation:158,163` · `send-hazard-whatsapp:119-120` · `create-job-invoice:433` · `send-certificate-whatsapp:150,155` · `send-quote-whatsapp:255,266-270` · `send-email:457` · `invite-team-member:117`

**company_phone** (settings column)
- `send-schedule-confirmation:93,98` · `send-email:457` · `invite-team-member:117` · `admin/MessagingCatalogueTab.tsx:86` · `admin/TenantDetail.tsx:259,284,800,882` (only as a fallback) · `admin/CustomerIntegrationsTab.tsx:76`
- Separate field, not affected: `tenant_integrations.config.company_phone` is read by `trigger-outstanding-reminder:107`, `job-reminder-2day:76`, `send-area-bulk-whatsapp:72`, `generate-accountant-export:271`, `send-deposit-reminder:87`. The Business Information save doesn't touch this and I won't change it.

**business_phone**
- Edge functions: `quote-accepted-alert:55,59` · `missed-call-lookup:143,160` · `send-outstanding-invoice-reminders:77,82` · `generate-receipt-pdf:94,99` · `generate-quote-pdf:238` · `generate-hazard-pdf:162` · `generate-gas-install-pdf:98` · `generate-certificate-pdf:97,390` · `generate-cert3-pdf:107` · `generate-cert2-pdf:100` · `create-job-invoice:243` · `send-extrawork-payment-link:200,214` · `send-invoice-whatsapp:183,281` · `accept-quote:302,307` · `send-email:457` · `invite-team-member:117` · `send-quote-whatsapp:32,364` (the phone comes from the request body)
- Frontend: `ServiceReceipt.tsx:146` · `InvoicePreview.tsx:77` · `QuoteDetail.tsx:67,163` · `QuoteAcceptance.tsx:86,213` · `PublicReceipt.tsx:275` · `ExtraWorkPendingCard.tsx:129,142` · `MessageLog.tsx:141,153` · `TakePaymentModal.tsx:222` · `SendQuoteModal.tsx:97` · `admin/TenantDetail.tsx:259,416`

## Implementation (small, no DB structure change)

1. **Name-part rule** in `src/lib/messageFooter.ts`:
   - If the footer contains " | ", keep the first segment.
   - If it has no " | ", keep the whole footer as the name.
   - If it's empty, fall back to `business_name`.
   - Then add the saved address and phone, dropping blanks.
   - The current code already works this way. I'll make it explicit with a check for " | ".
2. **Keep** the `company_phone = business_phone` sync in the Business Information save (`GeneralTab.tsx`).
3. **Unit tests** (`src/lib/__tests__/messageFooter.test.ts`): piped footer, no-pipe footer ("K&N Gas Services"), blank address, blank phone, empty footer falling back to business name.
4. Run the full test suite, typecheck and build.

## Verification (TEST K&N `c0aa41ac…` only)

- Raw SQL read-back of `message_footer`, `company_phone` and `business_phone` for TEST K&N **before**.
- Save Business Information through the app, signed in as the TEST K&N office user.
- Same read-back **after**. Confirm "12 Beechdale Road" and "0872354257" are gone.
- Read-only check that real K&N (`8c37827f…`) and Dublin Gas settings are unchanged. **Business Information will not be saved on real K&N.**

## Report

Commit hash(es) on origin/dev, the diff, before/after raw rows, and test counts.
