# WhatsApp Template Audit — Phase 1

Status: in progress. Batch A (payments) and Batch C (bookings/reminders/inbound) pending.

Channel: 360Messenger free-form text only. No Meta-approved templates exist. Every
production body below is a hand-written string literal inside an edge function.

## Cross-cutting defects (confirmed so far)

### D1 — Two competing branding chains, neither exposes `org_address`
- `_shared/orgBranding.ts`: `settings.business_name || company_name || "our team"`,
  `settings.business_phone || company_phone || ""`, footer `message_footer || name`.
  Used **only** by the quote follow-up functions.
- `_shared/depositLink.ts`: resolves name/phone from
  `tenant_integrations.360messenger.config.*` instead — root cause of the deposit
  phone bug.
- Every other function queries `settings` directly, field by field, with its own
  fallback policy (mostly "no fallback, blank silently blocks the send").
- No path resolves a business address, so `{org_address}` cannot be supported until
  one resolver owns it.

### D2 — `user_id`-keyed tenant lookups
- `quote-accepted-alert/index.ts:55` — `settings?user_id=eq.${quote.user_id}` for the
  office recipient number and footer.
- `accept-quote/index.ts:302` — `settings?user_id=eq.${userId}` for the same purpose.
Both must move to `organisation_id`.

### D3 — Four different 360Messenger key-resolution orders
1. `api_key_secret → env ?? config.api_key` — send-quote-whatsapp, quote-followup-day3/6
2. `config.api_key || api_key_secret → env` — send-invoice-whatsapp, send-certificate-whatsapp
3. `getWhatsAppConfig` (`api_key_secret` only) — create-job-invoice, send-whatsapp-receipt,
   quote-accepted-alert
4. `fetchWhatsappApiKey(Client)` (supports both) — send-hazard-whatsapp,
   send-outstanding-invoice-reminders

### D4 — Three different opt-out implementations
- Shared `requireCustomerMessagingConsent`: send-quote-whatsapp, create-job-invoice,
  send-whatsapp-receipt, send-certificate-whatsapp, send-hazard-whatsapp,
  send-outstanding-invoice-reminders.
- Inline `customer.opted_out` boolean: `send-invoice-whatsapp:110-116`.
- `decideFollowup` internal check: quote-followup-day3/day6.
- Absent: `quote-accepted-alert` (internal office number — acceptable),
  `trigger-outstanding-reminder` (delegates body to Make.com — **not** acceptable).

### D5 — Inconsistent money formatting
`eur()` comma-grouped (create-job-invoice) vs plain `€${n.toFixed(2)}`
(send-invoice-whatsapp, send-quote-whatsapp, quote-accepted-alert,
send-outstanding-invoice-reminders).

### D6 — Security / correctness flags
- `send-quote-whatsapp`: the trailing `📞 ${business_phone}` line comes from the
  **request body**, not from the org record — caller-controlled.
- `trigger-outstanding-reminder`: no `requireResourceOrgAccess` / `requireBoundOrg`
  guard, no opt-out check, and falls back to a **global** webhook secret name
  (`OUTSTANDING_REMINDER_WEBHOOK_URL`) when the tenant has none.
- `create-job-invoice:441-443` hand-builds the public URL instead of using
  `getTenantPublicUrl`.
- `send-certificate-whatsapp:208-210` string-replaces "Gas Service/Safety/Boiler
  Service Certificate" inside custom templates, mutating operator-authored text.
- `send-hazard-whatsapp` stores hazard PDFs in the `certificates` bucket.

## Batch B — quotes, invoices, receipts, documents

### send-quote-whatsapp (`message_type: quote`)
Body `:313-347`:
```
Hi {firstName},

Here is your quote for {job_description}.

Quote No: {refNumber}

Total: €{quote_amount.toFixed(2)}
[+ "\n\nDeposit to secure booking: €{deposit.toFixed(2)}" if deposit > 0]

To accept this quote, reply:
YES {refNumber}
[+ "\n\nView and approve here:\n{acceptUrl}" if acceptUrl]
[+ "\n\n📄 View your full quote PDF:\n{quotePdfUrl}" if pdf]

{messageFooter}
[+ "\n📞 {business_phone}" if request body field truthy]
```
- `firstName` = `consent.name || customer_name || "there"`, first token.
- `refNumber` = `quote_number || "Q-" + quote_id.slice(0,4).toUpperCase()`.
- `acceptUrl`/`quotePdfUrl` via `getTenantPublicUrl(orgId, organisations.public_domain)`
  keyed on `quotes.access_token` (`:85-112`).
- `messageFooter` = `settings.message_footer` by `organisation_id` (`:236`); blank
  aborts the send.
- Org from `quotes.organisation_id`; hard block if missing (`:114-130`);
  `requireResourceOrgAccess` IDOR guard.

### quote-followup-day3 / day6 (`_shared/quoteFollowup.ts`)
Day 3 `:131-137`:
```
Hi {firstName}, just checking you got {quoteRef} we sent over. Happy to answer any questions or adjust anything if needed.
[+ "\n\nView your quote here: {url}"]

Thanks,
{businessName}
```
Day 6 `:144-150`:
```
Hi {firstName}, we wanted to follow up on {quoteRef} we sent over. We have some availability coming up if you'd like to go ahead. {contactLine}
[+ "\n\nView your quote here: {url}"]

Thanks,
{businessName}
```
`contactLine` = `Reply to this message or call us on {phone} if you have any questions.`
when a phone exists, else `Reply to this message if you have any questions.`
- Branding via `getOrgBrandingClient`. Org taken from the `quotes` row (machine caller
  iterates all orgs). `whatsapp_messages` insert also stores `user_id: q.user_id`.

### quote-accepted-alert (internal office alert, `message_type: quote`)
Body `:131-138`:
```
✅ Quote Accepted

Customer: {customerName}
Quote: {quoteRef}
Total: €{totalAmount}
Deposit: €{depositAmount}

Job has been created — open BookedJobs to schedule.
[+ "\n\n{messageFooter}"]
```
- Recipient = `settings.whatsapp_number || settings.business_phone`, looked up by
  **`user_id`** (see D2). Sending org for the API key comes from
  `customers.organisation_id`; if `customer_id` is null it returns
  `sent:false, "No organisation_id for quote"` silently.
- `depositAmount` = `quotes.deposit || quotes.deposit_amount || 0`.

### send-invoice-whatsapp (`message_type: invoice_sent`, logged via `log-message`)
Body `:340-352`:
```
Hi {customer.name}, please find your invoice from {businessName}.

Job Ref: {jobRef}
Invoice #: {invoiceNumber}
Invoice Date: {invoiceDate}
Balance Due: {balanceDue}

Pay securely here: {paymentLink}

If you have any questions please reply to this message.

{businessName}
[+ "\n☎️ {businessPhone}"]
```
- `jobRef` = `service_calls.job_reference || "{settings.cert_prefix||'JOB'}-{id…}"`.
- `invoiceNumber` = `service_calls.invoice_number || "—"`; `invoiceDate` from
  `invoiced_at` as dd/mm/yyyy else `"—"`; `balanceDue` = `€{balance_due.toFixed(2)}`.
- `paymentLink` = `tenant_integrations(stripe).config.payment_link`; blank blocks send.
- `businessName` = `settings.business_name`; blank blocks send.

### create-job-invoice (`message_type: invoice`)
Body `:444`:
```
Hi {firstName}, please find your invoice attached for {job.job_type || "your job"}.

Total: {eur(total)}
Deposit paid: {eur(depositPaid)}
Balance due: {eur(balance)}

Invoice ref: {invNum}
Payment due within 14 days.
[+ "\n\n📄 View invoice:\n{invoiceUrl}"]
[+ "\n\nThank you, {messageFooter}"]
```
- Totals from the linked `quotes` row when `converted_job_id` matches, else
  `service_calls.revenue` / `deposit_amount`.
- `invNum` = `invoice.invoice_number || "INV-" + id.slice(0,8)`.
- `messageFooter` = `settings.message_footer || settings.business_name || ""`.
- Overlaps functionally with send-invoice-whatsapp (see D5) — different literals.

### send-outstanding-invoice-reminders (`message_type: outstanding_invoice`)
Body `:181-185`:
```
Hi {firstName}, this is a friendly reminder from {businessName} that you have an outstanding balance of €{balance} for work completed on {invoiceDate}.

Pay securely here: {stripeLink}

If you have already made payment please ignore this message. Any questions reply to this message.

{businessName} ☎️ {businessPhone}
```
- `businessName`/`businessPhone` required; blank aborts the whole batch.
- `stripeLink` = `tenant_integrations(stripe).config.payment_link ||
  tenant_integrations(360messenger).config.stripe_payment_link`.
- `invoiceDate` from `invoiced_at || completed_at`. Org bound via `requireBoundOrg`
  plus a per-job `assertSameOrganisation`. Claims `invoice_reminder_count` before
  sending and rolls back on failure.

### trigger-outstanding-reminder — no in-repo body
Posts to a Make.com webhook with `customer_name`, `customer_phone`, `company_name`,
`company_phone` (`:134-141`); the message text lives in the Make scenario. Company
fields come from `tenant_integrations(make).config.company_name/company_phone`
(required). See D6 for its missing guards.

### send-whatsapp-receipt (`message_type: receipt`)
Body `:144`:
```
Hi {customer.name}, thanks for your payment. Here's your receipt:

Job Ref: {jobRef}
[+ "\nReceipt: {receiptNum}"]
Service: {job.job_type || "Boiler Service"}
Date: {date}
Amount Paid: {amount} ({paymentMethod})
[+ "\n\n📄 View your receipt here: {tenantReceiptUrl}"]

Thanks,
{footer}
```
- `jobRef` = `job_reference || ("{cert_prefix}-{shortId}" | "Job {shortId}")`.
- `amount` via `resolveReceiptAmount({ paymentAmount: body, ledgerAmount: latest
  job_payments.amount, revenue: service_calls.revenue })`, formatted by
  `formatReceiptAmount` (fallback `"N/A"`).
- `footer` = `settings.message_footer || business_name`.

### send-certificate-whatsapp (`message_type: certificate`)
Default body `:145`, overridable by `settings.template_certificate` (`:156`):
```
Hi {{customer_name}}, please find your {certTypeLabel} {{certificate_number}}.

This certificate confirms all work has been completed in accordance with Irish gas safety standards.

Please keep this for your records.

Thank you for choosing us. 🔧

📄 View Certificate:
{{certificate_url}}
```
Footer always appended (`:214`); blank `settings.message_footer` blocks the send.
`certTypeLabel` from `certificates.notes.cert_type`, else the `GI-`/`DS-`/`DC-`
prefix of `cert_number`, else a generic label. Attachment is a 1-hour signed URL on
the `certificates` bucket, else raw `cert.pdf_url`.

### send-hazard-whatsapp (`message_type: hazard_notification`)
Body `:168`:
```
Hi {firstName}, please find attached your Gas Installation Notification of Hazard/Non-Conformance from {engineerName}.
[+ "\n\n📄 View Document:\n{tenantHazardUrl}"]

{messageFooter}
```
- `engineerName` = `engineers.name` via `service_calls.assigned_engineer_id`, default
  `"your engineer"`. Org from `service_calls.organisation_id` via `hazard.job_id`;
  hard block if missing.

## P1 LIVE BUG — deposit reminders have never been delivered

`send-deposit-reminder/index.ts:106` posts `formData.append("phone_number", cleanNumber)`.
Every one of the other 31 send paths uses `"phonenumber"` (no underscore). 360Messenger
rejects the malformed request.

Evidence from `message_log` (`message_type = 'deposit_reminder'`):

| organisation | rows | status | last attempt |
|---|---|---|---|
| K&N `8c37827f…` | 16 | failed | 24/08/26 |
| Dublin Gas `f195068…` | 10 | failed | 30/08/26 |

26 of 26 attempts failed — **zero successes ever**, across both tenants, back to at least
25/05/26. Every failure is `360Messenger HTTP 403: {"message":"Forbidden resource"}`.
Note K&N is otherwise healthy on WhatsApp, so this is not the Dublin Gas 403 outage; the
two just look alike in the log. Fix is a one-word change plus switching the bespoke
`.replace(/^\+/, "")` to shared `normalisePhone`.

## Batch A — payments and deposits

### accept-quote — office alert (`message_type: quote`, failure-only logging)
Body `:317` is byte-identical to `quote-accepted-alert`'s body (see D7 below):
```
✅ Quote Accepted

Customer: {customerName}
Quote: {quoteRef}
Total: €{totalAmount}
Deposit: €{depositAmount}

Job has been created — open BookedJobs to schedule.
```
- Recipient `settings.whatsapp_number || business_phone` and `organisation_id` both from
  `settings?user_id=eq.${updatedQuote.user_id}` (`:302`) — see D2. Not cross-checked
  against `quotes.organisation_id`; silently skipped when either is absent.
- Success is never written to `message_log`; only `logWhatsAppFailure`.

### accept-quote — customer deposit link
Delegates to `sendDepositLink`. Org from
`service_calls?id=eq.{serviceCallId}&select=organisation_id` (`:422-427`); this endpoint
authenticates on `quote_id` + `access_token` only, no user JWT, so the org is taken purely
from the DB row. Skips as `no_organisation` when absent.

### _shared/depositLink.ts (`message_type: payment_link`)
Body `:267`:
```
Hi {customerName},

Thank you for approving your quote with {companyName}.

To confirm your booking and secure the parts for your job, a 50% deposit of €{depositAmount.toFixed(2)} is required.

Pay securely here: {paymentLink}

If you have any questions please reply to this message.

{companyName} ☎ {companyPhone}
```
- `companyName`/`companyPhone` from `tenant_integrations(360messenger).config.company_name`
  / `.company_phone` (`:115-122`), **no fallback** — blank means the send is skipped and a
  `status:"failed"` `message_log` row is written. This is the confirmed deposit phone bug
  (D1): the rest of the app takes these from `settings`.
- `customerName` = caller arg, else `customers.name`, else `"Customer"`.
- `organisation_id` is always caller-supplied (`:15-16`, `:76-79`) — this module never
  resolves it, so scoping correctness rests entirely on callers.
- `paymentLink` = SumUp checkout URL via `createSumUpDepositCheckout` +
  `resolveSumUpCredentials`.
- Key via `fetchWhatsappApiKeyWithClient`; opt-out honoured from arg or `customers.opted_out`.

### send-deposit-link
No body of its own. Strictest org derivation in the codebase: `get_my_org_id()` RPC on a
caller-JWT client (`:49-70`), then `service_calls.organisation_id === callerOrgId` or 404
(`:87-94`). Then calls `sendDepositLink`.

### send-deposit-reminder (`message_type: deposit_reminder`) — BROKEN, see P1
Body `:102`:
```
Hi {customer.name}, this is a reminder that your deposit payment is still outstanding for your booking with {companyName}.

Please pay securely here: {job.payment_link}

If you have any questions please reply to this message.

{companyName} ☎ {companyPhone}
```
- `customer.name` has **no fallback** — a null name renders the literal `undefined`.
- `companyName`/`companyPhone` from `tenant_integrations(360messenger).config` (D1).
- `job.payment_link` is the raw `service_calls.payment_link` column.
- Machine caller (`requireMachineCaller`); org from `job.organisation_id`, jobs without one
  are skipped. Opt-out filtered in the query and re-checked at `:60`.

### send-payment-link (`message_type: payment_link`)
Body `:220-230`:
```
Hi {customer.name}, please find your invoice attached for {job.job_type || "your job"}.

Total: €{jobTotal.toFixed(2)}

Deposit paid: €{depositAmount.toFixed(2)}

Balance due: €{balanceDue.toFixed(2)}

Invoice ref: {job.invoice_number || "N/A"}

Payment due within 14 days.
[+ "\n\n📄 View invoice:\n{invoice_pdf_url}"]
+ "\n\n💳 Pay now:\n{paymentLink}"
[+ "\n\nThank you, {footer}"]
```
- Note the double newlines between amount lines — `create-job-invoice` sends the same
  content with single newlines (D7).
- `jobTotal` = `job.revenue || 0`; `depositAmount` = `deposit_required ? deposit_amount : 0`;
  `balanceDue` = `job.balance_due || (jobTotal - depositAmount) || jobTotal`.
- `invoice_pdf_url` is a **request-body field** interpolated unvalidated into the outbound text.
- `footer` = `settings.message_footer || business_name || ""` by `organisation_id`.
- Org via `get_my_org_id()` RPC + job match or 404. Key resolved inline
  (`cfg.api_key || env[cfg.api_key_secret]`, `:194-210`) with no `whatsapp`-row fallback (D3).

### send-payment-received (`message_type: payment_received`, via `log-message`)
Body `:216-225`:
```
Hi {customer.name}, thanks for your payment. Here is your receipt:

Job Ref: {jobRef}
Receipt: {invoiceNumber}
Service: {job.job_type || "—"}
Date: {scheduledDate}
Amount Paid: {amountPaid}
[+ "View your receipt here: {receiptUrl}\n\n"]
Thanks,
{companyName}
```
- **`jobRef` falls back to a hardcoded `"KN-"` prefix** (`:165-167`) — leaks K&N branding into
  Dublin Gas messages whenever `job_reference` is null. Should use `settings.cert_prefix`
  like send-invoice-whatsapp / send-whatsapp-receipt do.
- `invoiceNumber` = latest `invoices.invoice_number`, else `"—"`.
- `amountPaid` via `resolveReceiptAmount({ paymentAmount: request body,
  ledgerAmount: latest job_payments.amount, revenue: service_calls.revenue })`.
- `receiptUrl` = `https://{organisations.public_domain}/receipt/{service_calls.access_token}`.
- `companyName` from `tenant_integrations(360messenger).config.company_name`, no fallback (D1).
- Org via `requireResourceOrgAccess` on `service_calls`. Ireland-specific inline phone
  normalisation (`0…` → `353…`) instead of shared `normalisePhone` (`:183-184`).
- Writes `status: "success"/"fail"` where every other path writes `"sent"/"failed"` (D8).

### send-extrawork-payment-link (`message_type: extra_work_payment`)
Body `:282-295`:
```
Hi {customer.name},

Your engineer has identified some additional work required during your service today with {companyName}.

Additional work:
{itemsSummary}
Amount due: €{amount}

To approve and pay securely tap here:
{paymentLink}

If you have any questions please call us on {companyPhone}.

{companyName} ☎ {companyPhone}
```
`itemsSummary` lines: `• {description} (x{quantity}) — €{line_total.toFixed(2)}`.
- `line_items` and `total_amount` are **request-body values**, not re-derived server-side.
- `companyName`/`companyPhone` from `settings.business_name` / `settings.business_phone`
  (`:195-206`) — the *opposite* source to the two deposit functions above, despite the
  identical `☎` signature line. Blank blocks the send.
- `paymentLink` = `service_calls.payment_link`, no fallback.
- Strongest org check in the batch: `requireResourceOrgAccess` on `quotes`, then explicit
  equality assertions for `service_calls.organisation_id` and `customers.organisation_id`
  (`:55-65`). Uses shared `normalisePhone`.

### sumup-payment-webhook — part-payment confirmation (`message_type: part_payment_received`)
Built by `_shared/depositConfirmationMessage.ts:48-77`:
```
Hi {name}, thanks for your payment.
[+ "Job Ref: {jobReference}\n" inserted at index 2 when present]

Amount paid: {formatEuro(amountPaid)} (Card)
Balance remaining: {formatEuro(balanceRemaining)}

This is a part payment, so your job is not fully paid yet — the balance above is still due. Your full receipt follows once the job is settled in full.
[+ "\n\nPayment record: {receiptUrl}"]
[+ "\n\nThanks,\n{footer}"]
```
- `formatEuro` = `€${(Math.round(v*100)/100).toFixed(2)}` — a **fourth** money formatter (D5).
- `name` fallback `"there"`.
- Branding via `getOrgBrandingClient` → `settings` with the generic `"our team"` default —
  a third branding source within this batch alone (D1).
- Org is `e.organisationId`, resolved in `_shared/sumupWebhook.ts` by whichever tenant's
  SumUp credentials successfully fetch the checkout, cross-checked against the job; guarded
  `if (!e.organisationId) return;` (`:491`).
- The same webhook also fires full-payment receipts by invoking `send-whatsapp-receipt`.

### _shared/notifyAdmin.ts — platform admin channel
No body (caller-supplied text). Recipient `ADMIN_WHATSAPP_NUMBER`; key
`THREESIXTY_API_KEY ?? MESSENGER_API_KEY` — **global secrets, not tenant-scoped**. No
`organisation_id`, no opt-out, no `message_log` row. Out of scope for the tenant catalogue
but must be excluded explicitly so it is not accidentally migrated.

## Additional cross-cutting defects (Batch A)

### D7 — Byte-identical duplicated bodies
- `accept-quote:317` and `quote-accepted-alert:131-138` send the *same* office alert text
  from two separate literals.
- `send-payment-link:220-230` and `create-job-invoice:444` send the same invoice content
  with different whitespace (double vs single newlines) and different money formatting.

### D8 — `message_log.status` vocabulary drift
`send-payment-received` writes `"success"/"fail"`; everything else writes `"sent"/"failed"`.
Any delivery-status UI must normalise this or that function's messages will render as
unknown-status.

### D9 — Caller-supplied content interpolated into outbound messages
`send-payment-link.invoice_pdf_url`, `send-extrawork-payment-link.line_items[*]` and
`.total_amount`, and `send-quote-whatsapp.business_phone` all reach the customer's phone
without server-side validation.
