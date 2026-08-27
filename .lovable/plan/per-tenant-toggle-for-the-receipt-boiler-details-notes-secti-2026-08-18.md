# Per-tenant toggle for the receipt boiler details / notes section

Add one per-organisation on/off switch that controls whether the "Boiler Details + Notes" section appears on the public receipt (screen and PDF). Default ON, so nothing changes for existing tenants until they turn it off.

## Confirmed by audit

- `public.settings` has exactly one row per organisation (4 rows / 4 distinct `organisation_id`) and already holds the receipt's business name, phone, address, RGI number and logo. It already carries boolean flags of this kind (`renewal_reminders_enabled`, `review_requests_enabled`, `payment_reminders_enabled`), so this is the right table.
- `get_receipt_public` already joins `settings` on `organisation_id` and returns business fields from it; `PublicReceipt.tsx` makes one RPC call and reads the whole JSON blob, so a new key needs no extra call.
- `generate-receipt-pdf` already fetches `settings` for the job's organisation (business name, phone, address, RGI, message footer), so the flag can join that same select.
- Settings has 13 tabs and no receipt-related section today — a new "Receipts" tab is needed.

## Step 1 — Database

One migration:
- Add `settings.receipt_show_boiler_details boolean not null default true`.
- Replace `get_receipt_public` to also return that flag from the joined settings row (default `true` when no settings row exists). No other returned field, behaviour, or access rule changes.

## Step 2 — New Settings tab

- New tab "Receipts" in `src/pages/Settings.tsx` (Receipt icon), placed after "Finance & Reporting".
- New `src/components/settings/ReceiptsTab.tsx` following the existing tab contract (`settings`, `onSave`, `saving` props), one card titled "Receipt Content" with a Switch labelled "Show boiler details and notes" plus a short helper line explaining that it controls the section on the customer-facing receipt and the PDF. Saves via the existing `handleSave`.

## Step 3 — On-screen receipt

- In `src/pages/PublicReceipt.tsx`, gate the existing details section on the new flag: treat missing/undefined as ON. No layout, styling, or hide-rule changes — the current empty-column and empty-section rules stay exactly as they are.

## Step 4 — PDF

- In `supabase/functions/generate-receipt-pdf/index.ts`, add the flag to the existing settings `select` and skip drawing the boiler/notes block when it is false, so the footer keeps its spacing. Redeploy the function.
- Existing receipts with a stored `receipt_pdf_url` still short-circuit and keep their current PDF; the flag only affects newly generated receipts.

## Verification

- Toggle off for a scratch tenant: confirm the section disappears on screen and from a freshly generated PDF.
- Toggle back on: confirm the section returns unchanged for K&N (K-045) on both surfaces.
- Confirm the "default ON, no action taken" behaviour on both K&N and Dublin Gas, not K&N alone.
