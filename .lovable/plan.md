# Findings: New Quote page + Products page (read-only)

No code changed. `/quotes/new` renders `src/pages/QuoteNew.tsx`, which is a thin wrapper (header + back button) around `src/components/quotes/QuoteForm.tsx`. `QuoteForm` renders no custom child components — only shadcn primitives. `QuoteEdit.tsx` reuses the same component with `quoteId`.

## 1. Fields rendered, in order

| # | Section (Card) | Label | Component | State | DB column |
| --- | --- | --- | --- | --- | --- |
| 0 | header | Quote number (read-only, edit mode only) | `<h2>` | `quoteNumber` | `quotes.quote_number` (DB-generated) |
| 1 | Customer & Job Type | Customer * | `Select` | `customerId` | `quotes.customer_id` |
| 2 | | Job Type | `Select` (hardcoded `JOB_TYPES` array, line 23) | `jobType` | `quotes.job_type` (falls back to `"other"`) |
| 3 | | Job Description | `Textarea` rows=2 | `jobDescription` | `quotes.description` |
| 4 | Line Items (repeating) | Description | `Input` + custom absolute-positioned product dropdown | `lineItems[].description` | `quote_line_items.description` |
| 5 | | Qty | `Input type=number` | `lineItems[].qty` | `quote_line_items.qty` |
| 6 | | Unit Price € | `Input type=number` | `lineItems[].unit_price` | `quote_line_items.unit_price` |
| 7 | | Total (computed, read-only) | `<p>` | derived qty × unit_price | `quote_line_items.line_total` (generated in DB) |
| 8 | | Delete row / Add Item | `Button` | — | — |
| 9 | Pricing Summary | Subtotal (read-only) | `<span>` | `subtotal` memo | not stored |
| 10 | | Discount € | `Input type=number` | `discount` | `quotes.discount` |
| 11 | | VAT 23% | `Switch` | `vatEnabled` | `quotes.vat_enabled` |
| 12 | | Total (read-only) | `<span>` | `total` (subtotal − discount + 23% VAT) | `quotes.total_amount` |
| 13 | | Deposit € | `Input type=number` | `deposit` (auto = `settings.deposit_percentage`% of total until manually edited) | `quotes.deposit` |
| 14 | | Balance Due (read-only) | `<span>` | `balanceDue` | `quotes.balance_due` |
| 15 | Notes, Terms, Expiry | Notes | `Textarea` rows=3 | `notes` | `quotes.notes` |
| 16 | | Terms & Conditions | `Textarea` rows=3 | `terms` | `quotes.terms` |
| 17 | | Expiry Date | `Popover` + `Calendar` (mode="single") | `expiryDate` (Date) | `quotes.expiry_date` (`yyyy-MM-dd`) |
| 18 | Actions | **Save Draft** — `variant="outline"` | `Button` → `handleSave(false)` | — | `quotes.status = "Draft"` |
| 19 | | **Send & WhatsApp** — hardcoded `bg-[#25D366]` | `Button` → `handleSave(true, true)` | — | `quotes.status = "Sent"`, `sent_at` |

Notes on the current implementation:
- Product autocomplete groups matches by `products.category`, defaulting to the literal string `"Parts"` when null (line ~370).
- There is **no** "Send" (non-WhatsApp) button — only Save Draft and Send & WhatsApp.
- The Expiry Date uses a popover `Calendar`, which conflicts with the recorded preference for native date inputs on mobile/iOS.
- `Command`/`CommandInput` and `Search`/`Send` icons are imported but unused (dead imports).

## 2. Write path on save (`handleSave`, lines 165-300)

1. Validation: customer required; at least one line item with a description.
2. **New quote only** — finds the most recent `service_calls` row for that customer with `status = 'Pending'`; if none, inserts one (`job_type`, `job_issue` = job description, `status: 'Pending'`, `has_quote: true`, `source: 'Quote'`). `quotes.job_id` is set to that job id.
3. `quotes` insert/update with: `user_id`, `organisation_id`, `customer_id`, `job_id`, `description`, `job_type`, `total_amount`, `discount`, `deposit`, `balance_due`, `vat_enabled`, `notes`, `terms`, `expiry_date`, `status`, and `sent_at` when sending.
4. `quote_line_items`: on edit, **all existing rows are deleted then re-inserted** (`quote_id`, `product_id`, `description`, `qty`, `unit_price`, `sort_order`). Row ids are not stable across saves.
5. `quotes.line_items` (the jsonb column) is **not** written by this form — only the child table is.
6. No cost/margin fields exist anywhere in the payload; `quote_line_items` has `unit_price` only.

## 3. "Send & WhatsApp" end-to-end

1. `handleSave(true, true)` saves the quote as above with `status: "Sent"`.
2. Best-effort PDF: raw `fetch` to `/functions/v1/generate-quote-pdf` with `{ quote_id }`, using the publishable key as bearer. On success, `quotes.pdf_url` is patched. Failures are swallowed.
3. `supabase.functions.invoke("send-quote-whatsapp")` with `quote_id`, `customer_name`, `mobile_number`, `job_description`, `quote_amount`, `deposit_amount`, `quote_number`, and `pdf_url` when available. Note it does **not** pass `customer_id` or `sent_by_user_id`.
4. Inside `supabase/functions/send-quote-whatsapp/index.ts`: re-reads `organisation_id`, `customer_id`, `access_token` from the quote → loads the org's 360messenger config from `tenant_integrations` (secret name → config key → `THREESIXTY_API_KEY` fallback) → reads `settings.message_footer` (falls back to the literal "K&N Gas Services") → builds tenant public links via `getTenantPublicUrl` for `/quote/{access_token}` and `/pdf/{access_token}`, omitting them when the org has no `public_domain`.
5. Message text: greeting, job description, quote number, total, optional deposit line, `YES {ref}` reply instruction, accept link, PDF link, footer, optional business phone.
6. Inserts `message_log` (`status: 'pending'`, `related_type: 'quote'`), POSTs to `https://api.360messenger.com/v2/sendMessage` (FormData, phone stripped of `+`), then patches `message_log` to `sent` or `failed`.
7. On success it patches `quotes.status = 'Sent'` and `sent_at` again, and inserts a `customer_activity` row (`whatsapp_sent`) — but only when `customer_id` was passed in the body, which the form does not do, so that activity row is currently never written from this path.

## 4. Settings > Products

- Rendered by `src/pages/Products.tsx` ("Products & Parts", route `/products`), with two tabs: **Products** (inline table + `Dialog` add/edit form) and **Categories** (`src/components/products/CategoriesTab.tsx`).
- `products.category` **already exists** as a nullable `text` column. It is free text — not an enum, not an FK to `categories`.
- Live data: 9 products, 0 with a null category. Values: `Parts` (3), `parts` (3, lowercase duplicate), `Boilers` (2), `Heat Controls` (1).
- The `categories` table is a separate, org-agnostic lookup (no `organisation_id`) holding: Boilers, Heat Pumps, Heat Controls, WiFi & App Units, Parts, Labour, Materials, pipe work. The product form's category `Select` is populated from it, but because the link is by string there is drift (`parts` vs `Parts`) and the filter buttons match exact-case, so lowercase `parts` products are invisible under the "Parts" filter.
