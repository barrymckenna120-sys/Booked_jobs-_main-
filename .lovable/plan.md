## Goal

Add two optional fields — **GPRN** and **Boiler Location** — to Step 2 (Job Details) of the New Job wizard. Both live on the customer record, not the job. Plus extract the GPRN validation rule into a shared helper so it is defined once.

## 1. Shared validation helper (new)

`src/lib/validation/gprn.ts`:

```ts
export function isValidGprnFormat(value: string): boolean {
  return /^\d{7}$/.test(value.trim());
}
export const GPRN_WARNING_MESSAGE = "Doesn't look like a GPRN (usually 7 digits) — will still save";
```

- `ImportCustomers.tsx:321-322` swaps its inline regex + literal for this import. Its call site currently strips inner spaces before testing (`gprn.replace(/\s/g, "")`), so that normalisation stays at the call site to keep behaviour identical.
- The new NewJobPanel GPRN field imports the same helper — no second copy of the regex.
- The queued engineer job-detail card version will import from here too rather than copy-pasting a third time.

## 2. Database

`customers.gprn` already exists (text). `customers.boiler_location` does **not** — one migration:

```sql
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS boiler_location text;
```

No new table, so existing customer RLS/grants cover it.

## 3. Step 2 UI (`src/components/jobs/NewJobPanel.tsx`)

New row directly below the existing Boiler Type / Boiler Error Code grid (lines ~500-509), identical `grid grid-cols-2 gap-3` + uppercase Label + `Input ... className="mt-1"` styling:

- **GPRN** — prefilled from `prefilledCustomer?.gprn`, placeholder `e.g. 1234567`
- **Boiler Location** — prefilled from `prefilledCustomer?.boiler_location`, placeholder `e.g. kitchen, attic, utility room`, no validation

GPRN soft warning: when a value is present and `isValidGprnFormat` returns false, render `GPRN_WARNING_MESSAGE` as inline amber helper text. Purely advisory — `handleNext` is unchanged and never blocks.

Both values join the `onNext({...})` payload alongside `boilerType` / `boilerErrorCode`.

## 4. Prefill plumbing

Add `gprn, boiler_location` to the Step 1 customer search `select()` (line 138) so the selected-customer object carries values to prefill. Read-only addition; no Step 1 UI change.

## 5. Save path (submit handler)

In the existing "Sync job fields back to existing customer profile" block (lines 1209-1223), add `gprn` and `boiler_location` to `custUpdate` following the same non-blank pattern — blank stays untouched/null, never `""`.

For the new-customer insert branch (~line 1141), pass `gprn` and `boiler_location` with a `|| null` fallback. Nothing is written to `service_calls`.

## Out of scope

Import page beyond the single validation-import swap, Step 1 UI, customer edit page, wizard steps 3+.

## Verification

- Typecheck.
- Existing customer with a GPRN → Step 2 shows it prefilled; edit both fields, finish wizard, confirm the customer row updates and the job row gains no new columns.
- 5-digit GPRN shows the warning and still submits.
- **Blank-field check:** submit with both GPRN and Boiler Location empty, then a real `SELECT gprn, boiler_location FROM customers WHERE id = …` to confirm both land as `null`, not `""`.
- **Regression check:** confirm Boiler Type, Boiler Error Code, Area, Owner or Tenant, and Access Notes still save correctly now that the new fields share the same payload object.
- Import page: re-run a GPRN import to confirm the shared helper produces the same warning as before.
