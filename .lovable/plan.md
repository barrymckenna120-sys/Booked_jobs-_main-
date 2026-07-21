
Scoped change: customer form + import write the new `boiler_brand` / `boiler_model` columns AND keep syncing the legacy `boiler_make_model` for backward compat. Nothing else touched.

## 1. `src/pages/CustomerDetail.tsx`

- Brand/Model dropdowns already bind correctly — no UI change.
- On save (lines 220-223), KEEP the derivation:
  ```ts
  // TEMP: keep boiler_make_model in sync until downstream consumers
  // migrate to boiler_brand/boiler_model (DayJobsPanel, WarrantyDetail,
  // WarrantyTracker, JobSlotDrawer, NewJobPanel, EngineerJobDetail,
  // BoilerBrandsTab, IncomingJobCard, DataTab export).
  const brand = (updates.boiler_brand || "").trim();
  const model = (updates.boiler_model || "").trim();
  updates.boiler_make_model = [brand, model].filter(Boolean).join(" ") || null;
  ```
- Only change here is adding the TEMP comment above the existing block. No other edits.

## 2. `src/pages/ImportCustomers.tsx`

`HEADER_TO_FIELD` (lines 28-29): replace the two combined entries with:
```ts
"boiler brand": "boiler_brand",
"boiler make":  "boiler_brand",   // alias
"boiler model": "boiler_model",
```

Row-builder (line 251): replace the single `boiler_make_model: field(row, "boiler_make_model")` with:
```ts
boiler_brand: field(row, "boiler_brand"),
boiler_model: field(row, "boiler_model"),
// TEMP: keep boiler_make_model in sync until downstream consumers
// migrate to boiler_brand/boiler_model.
boiler_make_model: [field(row, "boiler_brand"), field(row, "boiler_model")]
  .filter(Boolean).join(" ") || null,
```

No changes to date parsing, phone handling, validation, or any other field.

## 3. `src/lib/generateTemplate.ts`

- Category header row: expand `BOILER INFO` group from 4 → 5 columns.
- Column header row: replace `"Boiler Make / Model"` with `"Boiler Brand"`, `"Boiler Model"`.
- Sample data rows (4): split combined values into two cells (e.g. `"Vaillant"`, `"ecoTEC Plus"`; `"Worcester"`, `"Greenstar"`; `"Baxi"`, `"600"`; `"Ideal"`, `"Logic+"`).
- `ws["!cols"]`: insert one extra `{ wch: 22 }` entry so widths stay aligned.
- Title merge: `e.c: 18` → `19`.

## Out of scope
The 8 downstream components that still read `boiler_make_model` are intentionally left untouched.

## Delivery
After approval, apply the three edits and paste the diffs before you test.
