## Follow-up read (answered)

`details` is saved into the `certificates.notes` JSONB as `{ details, work_carried_out }` (`CertificateFlow.tsx` handleSubmit, insert + retry-queue payload). The PDF generator `supabase/functions/generate-certificate-pdf/index.ts` reads `const details = notes.details || {}` (lines 72, 372) — but it renders GPRN from the **customer row**, not from `details`:

- HTML path, line 165: `${customer?.gprn ? ... }`
- jsPDF path, line 414: `if (customer?.gprn) fieldPair("GPRN", customer.gprn, ...)`

So GPRN already appears on the generated certificate **whenever `customers.gprn` is populated**. No edge-function change is needed. The one ordering requirement: the `backfillCustomerGprn` call must be awaited **before** `supabase.functions.invoke("generate-certificate-pdf")`, otherwise a first-time GPRN entered by the engineer may not be on the customer row when the PDF renders. Storing `details.gprn` in `notes` is still worth doing as an audit record of what the engineer typed.

## Changes to apply

### 1. `src/components/engineer/CertificateFlow.tsx`

- Add import: `import { backfillCustomerGprn } from "@/lib/backfillCustomerGprn";`
- `details` state (line 165-177):
  - insert `gprn: customer?.gprn || "",` after `eircode`
  - `boilerBrand: job?.boiler_brand || customer?.boiler_brand || ""`
  - `boilerModel: customer?.boiler_model || customer?.boiler_make_model || ""`
- Field array (line 408-419): insert `["gprn", "GPRN"]` between `["eircode", "Eircode"]` and `["applianceType", "Appliance Type"]`.
- In `handleSubmit`, on the success branch, before invoking `generate-certificate-pdf`:
  ```ts
  await backfillCustomerGprn(customer?.id, details.gprn);
  ```
  (same pattern as `Cert2Flow.tsx:223`, but awaited so the PDF sees the value)

### 2. `src/pages/CustomerDetail.tsx` (lines 220-223)

Correct the incomplete TEMP list to add the three missed consumers:

```
// TEMP: keep boiler_make_model in sync until downstream consumers
// migrate to boiler_brand/boiler_model (DayJobsPanel, WarrantyDetail,
// WarrantyTracker, JobSlotDrawer, NewJobPanel, EngineerJobDetail,
// BoilerBrandsTab, IncomingJobCard, DataTab export,
// CertificateFlow.tsx, Cert2Flow.tsx,
// supabase/functions/generate-cert2-pdf/index.ts).
```

### Verification
- `tsgo --noEmit` on the two touched files.
- Manual: open the cert flow for a customer with a GPRN (prefilled) and one without (blank, entered value writes back).

Risk: low — prefill/presentation plus one additive DB write already used by three other flows.
