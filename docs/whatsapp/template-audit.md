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

**FIXED (31/08/26).** `send-deposit-reminder` now builds its form through the new
`_shared/whatsappPayload.ts` (`buildSendMessageForm` + `WHATSAPP_SEND_URL`), so the field
name cannot drift again; `_shared/whatsappPayload.test.ts` asserts `phonenumber` is present
and `phone_number` absent. Message copy and every other behaviour were left untouched, and
no historical `message_log` row was rewritten. Diagnosis corroborated read-only: over the
same window K&N sent successfully on 15 other message types (`booking_confirmation` 27/08,
`receipt` 24/08, `payment_link` 24/08), while `deposit_reminder` alone was 100% failed —
so the cause is the malformed field, not credentials or tenant health.


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

## P1 SECURITY — two send paths are publicly invocable with no auth gate

Verified directly, not inferred:

**`send-upcoming-reminders`** — `supabase/config.toml` sets `verify_jwt = false`, and the
function body contains **no** `requireMachineCaller`, `requireBoundOrg`, `x-make-secret`
check or any other gate (`index.ts:1-40` goes straight from the CORS preflight to a
service-role client). Anyone who knows the URL can invoke it. It then iterates **every
organisation**, finds every job scheduled two days out, and sends each customer a WhatsApp.
Unauthenticated cross-tenant customer messaging plus unbounded 360Messenger spend.

**`trigger-review-request`** — absent from `config.toml` entirely (so it inherits
`verify_jwt = false`) and has no caller-org check. It accepts arbitrary
`service_call_id` + `customer_id` from the body and fires the tenant's Make.com review
webhook. Its sibling `review-request` does gate on `requireBoundOrg`, so this is an
inconsistency rather than a deliberate design.

Both are outside the scope of this catalogue refactor and touch tenant isolation, so they
need their own review-gated fix rather than being folded into Phase 2/3.

**FIXED (31/08/26), each as its own isolated change.**

`send-upcoming-reminders` now resolves an authorisation *scope* before reading any customer
row, via the new pure helper `_shared/sweepScope.ts` (`resolveSweepScope`):

| caller | scope |
|---|---|
| anonymous | rejected `401` |
| per-tenant webhook secret | that tenant only; naming another org → `403` |
| signed-in user | own org only (superadmin may name an org); another org → `403` |
| service-role key (pg_cron) or global cron shared secret | all orgs — the only route to a full sweep; naming an org narrows it |

The job query is `.eq("organisation_id", …)` whenever the scope is a single org, so a tenant
caller physically cannot reach another tenant's jobs. `verify_jwt = false` stays in
`config.toml` (the scheduled path needs it); the gate is in code. 11 unit tests in
`_shared/sweepScope.test.ts` cover the matrix.

`trigger-review-request` now uses `requireResourceOrgAccess` — the same shared standard as
the correctly protected sibling — resolving the org from the `service_calls` row itself, and
the `customer_id`, job re-read, `customer_activity` insert and `review_sent` update are all
scoped to that org, so a customer from another tenant can never be messaged.

Live verification against the deployed functions:

| check | result |
|---|---|
| `send-upcoming-reminders`, no credentials | `401 {"error":"Unauthorized"}` |
| `trigger-review-request`, no credentials | `401 {"error":"Unauthorized"}` |
| `trigger-review-request`, DG engineer → K&N job | `403 {"error":"Forbidden"}` |
| `trigger-review-request`, DG engineer → DG job | `200 {"skipped":true,"reason":"customer_opted_out"}` (gate passes, nothing sent) |
| `send-upcoming-reminders`, DG engineer naming K&N | `403 {"error":"Forbidden"}` |

Cross-tenant checks used an opted-out Dublin Gas scratch record, so no real customer was
messaged.

## Corrections to earlier claims (verified 31/08/26)

Recorded so nobody acts on the superseded versions:

- **No hard-coded K&N Tally URL fallback exists.** `send-warranty-whatsapp` and the renewal
  senders hard-*skip* (and log) when a tenant has no `renewal_form_url` / Tally URL. There is
  nothing to "fix" here.
- **No `current_setting('app.supabase_url')` / `app.service_role_key` pattern exists** in any
  edge function or migration.
- **No `cron.schedule` definitions exist in migrations.** A direct `cron.job` read shows 6
  active jobs (`job-reminder-2day-0900-dublin`, `quote-followup-day3`, `quote-followup-day6`,
  `send-deposit-reminder-daily`, `warranty-auto-send`, `purge-old-read-notifications`), all
  `active = true`, all passing credentials as literal headers — not the broken
  `current_setting` pattern.
- **The "broken warranty cron" claim is not supported.** `warranty-auto-send` is active and
  `quote_followup_day3`/`day6` have `status = 'success'` rows as recently as 30/08/26. No
  change made.

## Follow-up defects (separate items — deliberately NOT bundled into the three P1 fixes)

| # | function | defect |
|---|---|---|
| F1 | `job-reminder-2day` | can interpolate the literal string `"undefined"` into a customer message when `config.company_name` / `company_phone` is absent (no fallback). |
| F2 | `send-payment-received` | hard-codes a `"KN-"` job-reference prefix, leaking K&N branding into Dublin Gas messages when `job_reference` is null. Siblings correctly use `settings.cert_prefix`. |
| F3 | `send-warranty-whatsapp` | says "registered Gas Safe engineer" — a UK scheme. Irish tenants should read RGI. |
| F4 | branding fields | `settings.business_*` vs `company_*` are read inconsistently, so booking and schedule confirmations can show different names for the same tenant. Resolve in Phase 2's single tenant-scoped resolver. |


## Batch C — bookings, reminders, renewals, parts, inbound

### Functions that send no WhatsApp themselves
| function | what it actually does |
|---|---|
| `renewal-reminder-7` / `-14` / `-30` | Return JSON feeds for Make.com to send. `requireBoundOrg`, `opted_out` filtered in-query. `-14`/`-30` build the Tally URL and hard-fail 400 when absent; `-7` returns a bare customer list. |
| `review-request` | JSON feed of completed jobs >2h old with `review_sent=false`. `requireBoundOrg`; `settings.google_review_url` per org, skip+log if absent. |
| `trigger-review-request` | Posts to a Make webhook. Logs `customer_activity.event_type = "whatsapp_sent"` despite never calling 360Messenger — mislabelled. See P1 above. |
| `warranty-auto-send` | Cron orchestrator; `requireMachineCaller`; iterates all non-archived orgs and invokes `send-warranty-whatsapp` per eligible customer. Uses `Deno.env.get("SUPABASE_URL")`, **not** the broken `current_setting('app.supabase_url')` pattern. |
| `missed-call-lookup` | Make.com support endpoint (`lookup` / `log_followup`). Logs `message_type: "missed_call_followup"`. Takes `organisation_id` from the **body** once the shared secret authorises the request — a trusted caller can name any org. |
| `handle-whatsapp-opt-out` | Inbound STOP handler; sets `customers.opted_out`, logs `message_type: "opt_out"`. `resolveMachineOrganisation` fails closed and refuses to guess. |

### cancel-job-notify (`cancel_job_notify`)
```
Hi {firstName}, your booking with {branding.name} has been cancelled. Reason: {cancellation_reason}.[ To rebook please call us on {branding.phone}.]
```
Branding via `getOrgBrandingClient`. Org from `get_my_org_id()` RPC, job org must match
(`:73`, `:117`) — fail-closed. `requireCustomerMessagingConsent`. Also writes
`whatsapp_messages.message_type = "template"` keyed on `sc.user_id` (display only).

### job-reminder-2day (`job_reminder_2day`)
```
Hi {firstName},

This is a reminder from {companyName} that your appointment is confirmed for {formattedDate} at {formattedTime}.
[\nYour engineer will be {engineerName}.\n]
Please reply CONFIRM to confirm your appointment or CANCEL to cancel. Alternatively call us on {companyPhone}.

{companyName} ☎ {companyPhone}
```
- `companyName`/`companyPhone` from `tenant_integrations(360messenger).config` with **no
  fallback** — a missing value interpolates the literal string `"undefined"` into the
  customer's message. Real defect, not just style.
- `requireMachineCaller`; org per-row from `service_calls.organisation_id`. Key resolved by
  a hand-rolled duplicate of `fetchWhatsappApiKey` (`:51-56`).

### send-booking-confirmation (`booking_confirmation`)
```
Hi {firstName}, your booking with {companyName || "us"} is confirmed.

📅 Date: {formattedDate}
⏰ Time: {timeSlot}
👷 Engineer: {engineerName}

If you need to make any changes please reply to this message.
[+ "\n\n{messageFooter}"]
```
`companyName` = `settings.business_name || "us"` (a second hardcoded name fallback, distinct
from `orgBranding`'s `"our team"`). Date/time/engineer each default to `"TBC"`.
`requireResourceOrgAccess`. Opt-out via `bookingConfirmationSkip`, which logs a
`status:"skipped"` row. Key resolution is **literal-first** (`config.api_key || env[...]`).

### send-schedule-confirmation (`schedule_confirmation`, via `log-message`)
```
Hi {firstName}, your booking[ with {companyName}] is confirmed.

📅 Date: {scheduledDate}
⏰ Time: {timeSlot}
👷 Engineer: {engineerName}

If you need to make any changes please reply to this message.[

{signoff}]
```
`signoff` = `[companyName, companyPhone].filter(Boolean).join(" ☎ ")`. Branding from
`settings.company_name`/`company_phone` — note this reads `company_*` where
send-booking-confirmation reads `business_*`, so the two confirmation messages can show
different names for the same tenant. Near-duplicate of send-booking-confirmation (D7).

### send-reschedule-notification (`reschedule_notification`)
```
Hi {firstName}, your appointment has been rescheduled to {newDate} at {timeSlot}. Apologies for any inconvenience — {messageFooter}
```
`settings.message_footer` is **hard-required**: blank means the send is skipped with
`message_footer_not_configured` (`:94-133`). `requireResourceOrgAccess` +
`requireCustomerMessagingConsent`.

### send-cancellation-notice (`cancellation`)
```
Hi {firstName}, your booking with {branding.name} has been cancelled.

Reason: {cancellationReason}

[To rebook please call us on {branding.phone}.

]{branding.footer || branding.name}
```
`cancellationReason` = `service_calls.cancellation_reason || "No reason provided"`. Opt-out
is an ad-hoc inline check rather than the shared consent gate. Overlaps heavily with
`cancel-job-notify` (D7) — two functions, two literals, same customer event.

### send-part-arrived (`part_arrived`)
```
Hi {firstName}, great news! The part we ordered for your boiler has arrived. 🔧

We'd like to arrange a time to come back and complete the work.

Details: {follow_up_detail || "Follow-up repair"}

Please reply to this message or call us to book a time that suits you.
[+ "\n\n{messageFooter}"]
```
Entire body is overridable by an unvalidated `customMessage` body arg (`:157`) — see D9.
`messageFooter` = `settings.message_footer || business_name || company_name || ""`
(degrades rather than blocking). Key resolver can fall back to the literal key on the
*other* integration row (same tenant).

### send-upcoming-reminders (`appointment_reminder`)
```
Appointment Reminder 📅
{messageFooter}

Hi {firstName}, just a reminder that your {jobType} is booked for {targetStr} between {timeSlot}.

Your engineer {engineerName} will be with you on the day. If you need to reschedule, please give us a call.

Thanks,
{messageFooter}
```
`messageFooter` appears **twice** — once as a header line, once as the sign-off. Required:
a blank footer skips the whole org. `engineerName` = `assigned_engineer || "our engineer"`.
See P1 above for the missing auth gate.

### send-renewal-reminder (`renewal_reminder`)
```
Hi {first_name},

This is {companyName}. Your annual boiler service is due on {renewal_date}.

If your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.

{bookLine}

Reply STOP to unsubscribe.
{companyName}
```
`bookLine` = `Book online: {renewalFormUrl}?customer_phone={cleanPhone}\n\nOr reply here or
call us on {companyPhone}.` when a Tally URL exists, else `Reply here to book your service
or call us on {companyPhone}.` `first_name` and `renewal_date` are **request-body args**,
not re-derived from the DB, even though the recipient phone is DB-only.
`requireResourceOrgAccess` on `customers`; cross-sibling-phone dedup via
`isDuplicateRenewalSend`.

### send-area-bulk-whatsapp (`renewal`)
```
Hi {firstName},

This is {companyName}. Your annual boiler service is due on {dueDate}.

If your boiler is under manufacturer warranty, maintaining a yearly service is generally a condition of keeping that warranty valid.

Reply here to book your service or call us on {companyPhone}.

Reply STOP to unsubscribe.
{companyName}
```
Almost the same message as `send-renewal-reminder` but with "is generally a condition"
vs "is a condition", no booking link, and `message_type: "renewal"` vs
`"renewal_reminder"` — so the two renewal paths are invisible to each other's dedup logic.
`companyName`/`companyPhone` from `tenant_integrations(360messenger).config`, trimmed, blank
skips. `requireCallerOrg` restricted to office/admin/owner/manager, plus a per-recipient
`customers.organisation_id === callerOrgId` check. `dueDate` falls back to `"soon"`. Also
writes `whatsapp_messages` keyed on `custRecord.user_id`.

### send-warranty-whatsapp (`warranty_day14` / `warranty_day28`)
Day 14:
```
Hi {first_name}, this is {branding.name}.

We are getting in touch to let you know your {boiler_brand} {boiler_model} boiler, installed on {install_date_formatted}, is currently covered under the manufacturer's warranty.

⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.

Book your annual service here:
👉 {tallyUrl}[

Or call us on 📞 {branding.phone}]

{footerLine}
```
Day 28:
```
Hi {first_name}, this is {branding.name}.

We messaged you two weeks ago about your new {boiler_brand} {boiler_model} boiler warranty. We just wanted to follow up — booking your annual service is the best way to keep your warranty valid and your boiler running safely.

Book here:
👉 {tallyUrl}[

Or call us on 📞 {branding.phone}]

{footerLine}
```
- **Copy defect:** "registered Gas Safe engineer" is the UK scheme. Irish tenants must say
  RGI / Registered Gas Installer.
- `tallyUrl` from `tenant_integrations(tally).config.renewal_form_url`; **no hardcoded K&N
  Tally fallback exists** — absence is a hard skip (`:349-373`). The previously suspected
  leak is not present in the current code.
- Branding is hard-required and additionally rejects the `"our team"` default (`:437-465`),
  so an org without `business_name` never receives warranty sends at all.
- `first_name`, `boiler_brand`, `boiler_model`, `install_date_formatted` are all body args.
  Machine callers are trusted org-wide with whatever `customer_id`/`phone` they supply;
  only user callers re-normalise the phone against the DB row.

### whatsapp-inbound (`inbound` + reply types)
Replies, all via `sendReply()` with `getWhatsAppConfig(actingOrgId)`:
- opt-out `:747`: `Got it — we've removed you from our reminder list. No further messages will be sent. {branding.footer || branding.name}.`
- unmatched `:881`: `Thanks — we couldn't match that to an upcoming appointment. Please call us[ on {branding.phone}] and we'll help.`
- ambiguous `:906`: `Thanks — you have more than one upcoming appointment with us, so we don't want to change the wrong one. Please call us[ on {branding.phone}] and we'll sort it straight away.`
- confirm `:1006`: `Thanks {jobOwnerName}, your appointment is confirmed. See you then! {branding.footer || branding.name}`
- cancel `:1065`: `Thanks {jobOwnerName}, your appointment has been cancelled. To rebook please call us[ on {branding.phone}]. {branding.footer || branding.name}`

Org is derived from the customer rows matching the inbound phone, never from a caller;
CONFIRM/CANCEL require a single unambiguous org via `pickActingOrg` or are dropped as
`cross_org_ambiguous`. Webhook itself is gated by `WHATSAPP_INBOUND_SECRET` (fail-closed if
unset) or a machine caller. `whatsapp_messages.user_id` falls back to
`organisations.owner_user_id` purely to satisfy the NOT NULL column. STOP applies
`opted_out` to **every** customer row sharing that phone, across orgs. Duplicate inbound
guard: same sender + body + provider timestamp within 10 minutes.

## Additional cross-cutting defects (Batch C)

### D10 — `settings.business_*` vs `settings.company_*` split
`send-booking-confirmation` reads `business_name`; `send-schedule-confirmation` and
`send-renewal-reminder` read `company_name`/`company_phone`; `orgBranding.ts` tries
`business_*` then `company_*`. A tenant that has filled only one pair gets a correct name in
some messages and a blank or `"undefined"` in others.

### D11 — Near-duplicate message pairs
- `send-booking-confirmation` ≈ `send-schedule-confirmation` (same emoji block, different branding fields).
- `cancel-job-notify` ≈ `send-cancellation-notice`.
- `send-renewal-reminder` ≈ `send-area-bulk-whatsapp` (one word differs; different `message_type`, so dedup does not span them).

### D12 — `"undefined"` can reach customers
`job-reminder-2day` interpolates `config.company_name`/`company_phone` with no fallback and
no guard. Same class of risk in `send-deposit-reminder` (`customer.name`).

### D13 — UK gas terminology in an Irish product
`send-warranty-whatsapp` day-14 says "registered Gas Safe engineer"; should be RGI.

### D14 — Nine distinct `message_type` values for renewal-ish sends
`renewal`, `renewal_reminder`, `warranty_day14`, `warranty_day28`, `appointment_reminder`,
`job_reminder_2day`, `booking_confirmation`, `schedule_confirmation`,
`reschedule_notification` — with no shared enum. The catalogue in Phase 2 must own this
vocabulary.

### Corrections to earlier assumptions
- **No hardcoded K&N Tally URL fallback exists** in `send-warranty-whatsapp` or any Batch C
  function. Every Tally URL is tenant-configured and absence is a hard skip.
- **No cron function uses the broken `current_setting('app.supabase_url')` pattern.** No
  `cron.schedule` definitions for these functions were found in `supabase/migrations` at
  all, so the actual schedules live in `cron.job` in the DB and need direct inspection
  before anyone claims the warranty/follow-up crons are broken.

## Phase 1 totals

- 32 WhatsApp send call sites across 30 functions; 0 Meta templates; every body is an
  inline literal.
- 3 branding sources, 2 hardcoded name fallbacks (`"our team"`, `"us"`), 0 sources for
  `org_address`.
- 4 money formatters, 4 API-key resolution orders, 4 opt-out implementations,
  2 `message_log.status` vocabularies.
- 2 `user_id`-keyed tenant lookups that must become `organisation_id`.
- 3 P1 items requiring their own isolated fixes: the `phone_number` field-name bug, and the
  two unauthenticated send paths.

## Phase 2 — canonical catalogue and branding resolver (infrastructure only)

Landed: `_shared/whatsappCatalogue.ts` (39 entries, pure builders, byte-equal to current
production output), `_shared/orgBranding.ts` (organisation-scoped `org_name` / `org_address` /
`org_phone` / `footer`), the generated frontend mirror, and 55 new tests (43 catalogue,
12 branding). No Edge Function imports them yet and no customer-facing wording changed.

Full detail, precedence tables and the equality-vs-resolver conflicts are in
[phase2-migration-map.md](./phase2-migration-map.md). Two corrections this phase makes to the
findings above:

- **D14 is now owned:** `CATALOGUE_MESSAGE_TYPES` in the canonical catalogue is the
  `message_log.message_type` vocabulary.
- **`renewal_reminder` skip/degrade behaviour was mis-recorded.** Read back against the
  function, a missing Tally URL, company name or company phone all *degrade* — none of them
  skip the send. The old frontend catalogue claimed `renewal_form_url` was a skip.
