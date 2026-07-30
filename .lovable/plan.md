## Goal

Add an optional, free-text GPRN (Gas Point Reference Number) to the customer record and surface it everywhere Eircode currently appears in the app, so office staff and engineers can see a property's gas reference without opening a certificate.

GPRN already exists today as a per-certificate field (`cert2_certificates.gprn`, plus manual inputs in the Cert2 / Cert3 / Gas Install flows). That stays authoritative **on the certificate**; the new customer-level GPRN becomes the value that prefills those inputs.

**Out of scope:** quotes, invoices, and receipts. No changes to `generate-quote-pdf`, `create-job-invoice`, `generate-receipt-pdf`, `InvoicePreview.tsx`, `ServiceReceipt.tsx`, `TakePaymentModal.tsx`, `PublicReceipt.tsx`, or the `get_receipt_public` function.

## Database

One migration, a single statement:
- `ALTER TABLE public.customers ADD COLUMN gprn text;` — nullable, no default, no CHECK constraint (free text, per your call).
- No RLS or grant changes: `customers` policies are column-agnostic and already scoped by `organisation_id`.

## 1. Customer record

- `src/components/customer/AddCustomerSheet.tsx` — GPRN `CustomerFormField` next to Eircode / Area Code; add to `EMPTY_FORM` as an empty string so it doesn't affect the `isDirty` check, and include in both the insert and the "update existing duplicate" payloads.
- `src/pages/CustomerDetail.tsx` — editable GPRN field in the same grid region as Eircode / Area Code; not wired into `blurField` since there's no validator.
- `src/pages/Customers.tsx` — no new table column (the table is already dense on mobile); add `gprn` to the search predicate so staff can find a property by GPRN.
- `src/components/settings/DataTab.tsx` — add a `"GPRN"` column to the customer CSV export.

## 2. Job screens

Each of these already selects customer fields and renders an Eircode row or tile — add GPRN immediately after Eircode, showing `—` when empty:
- `src/pages/JobDetail.tsx` (select L371, render near L566)
- `src/pages/engineer/EngineerJobDetail.tsx` (InfoTile after L680)
- `src/components/engineer/JobDetailSheet.tsx` (InfoTile after L97)
- `src/components/schedule/JobSlotDrawer.tsx` (field after L111), plus the `src/pages/Schedule.tsx` select and mapping (L170, L181)
- `src/components/incoming/JobReviewPanel.tsx` (row after L262), plus the `src/pages/IncomingJobs.tsx` select (L83)

Not changing: `EngineerJobCard`, `DayJobsPanel`, `Jobs.tsx` search results, `QuickActions` — compact list and navigation surfaces where GPRN adds noise and no value.

## 3. Certificate flows

Prefill only. The engineer can always overwrite, and the saved certificate keeps its own value:
- `src/components/engineer/Cert2Flow.tsx` — seed `gprn` state from `customer.gprn`
- `src/components/engineer/Cert3Flow.tsx` — same
- `src/components/engineer/GasInstallationFlow.tsx` — same
- `src/components/engineer/GasInstallationCertForm.tsx` — fall back to `customer.gprn` when `existingCert.gprn` is empty

Each flow needs `gprn` added to the customer query feeding it. The three cert PDF generators (`generate-cert2-pdf`, `generate-cert3-pdf`, `generate-gas-install-pdf`) already print GPRN from cert notes — no change there. `generate-certificate-pdf` and `generate-hazard-pdf` have no GPRN line today; add one under Eircode, read from the customer record.

## 4. Import

- `src/lib/generateTemplate.ts` — add `"GPRN"` to the header row after "Area Code", with a matching column-width entry.
- `src/pages/ImportCustomers.tsx` — header alias map (`"gprn"`), field label map, preview table head and `EditableCell`, row parse, insert payload. **Not** added to `REQUIRED_FIELDS` or `KNOWN_HEADERS` — it's optional, and touching `KNOWN_HEADERS` would change header-row detection for existing files.

Existing customer files without a GPRN column continue to import unchanged.

## 5. Messaging

No changes. The only message path carrying property references is the renewal rebooking Tally prefill (`renewal-reminder-30` / `renewal-reminder-14`, `&Eircode=` / `&Areacode=`), and a GPRN isn't something a customer would confirm on a rebooking form. Booking and schedule confirmations carry no property references at all today.

## Technical notes

- `gprn` appears in the regenerated `src/integrations/supabase/types.ts` automatically after the migration.
- `src/types/service-calls.ts` `SERVICE_CALL_BASE_SELECT` is unaffected — GPRN lives on `customers`, not `service_calls`.
- Every render site guards on presence, so existing rows with `NULL` gprn show `—` in the UI or omit the line entirely in the two cert PDFs.
- No validation, so no new entries in `src/lib/customerValidation.ts`.

## Risk

Low. With quotes/invoices/receipts excluded, this is an additive nullable column plus conditionally rendered read-only display. No financial documents, numbering, totals, or access-control paths are touched. The only behavioural change beyond display is the cert-flow prefill, which remains fully editable by the engineer.

I'll finish with the full diff.
