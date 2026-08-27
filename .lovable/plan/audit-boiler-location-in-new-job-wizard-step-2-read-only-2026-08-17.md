# Audit — Boiler Location in New Job wizard Step 2 (read-only)

## 1. There is no Boiler Location dropdown

`src/components/jobs/NewJobPanel.tsx:686-690` — Step 2 (Job Details) renders Boiler Location as a **free-text `<Input>`**, sitting beside GPRN:

```tsx
<Label ...>Boiler Location</Label>
<Input value={boilerLocation} onChange={(e) => setBoilerLocation(e.target.value)}
       placeholder="e.g. kitchen, attic, utility room" className="mt-1" />
```

State: `const [boilerLocation, setBoilerLocation] = useState(prefilledCustomer?.boiler_location || "")` (line 494). Passed through `onNext` (line 554), written to the job at line 1462 and back-filled to the customer record at line 1540.

So there is no option list — hardcoded, table-backed, or config-backed — because the field was never a select. Nothing is "empty and not rendering".

## 2. The only Step 2 dropdowns are Brand and Model, and they do have data

The two typeahead dropdowns in Step 2 come from `boiler_brands`:
- `NewJobPanel.tsx:501` — brands: `.select("brand_name").eq("is_default", true).order("brand_name").limit(8)`
- `NewJobPanel.tsx:514` — models: `.select("model_name").eq("is_default", false).eq("brand_name", ...).limit(8)`

Row counts for K&N (`8c37827f-…d89856`): 6 brand rows (`is_default = true`) and 19 model rows (`is_default = false`). Both are populated, and every `boiler_brands` row in the database belongs to this org. If the report was "the dropdown is empty", it isn't a data gap on brands/models either — models only appear once a brand is typed, and each list is capped at 8.

## 3. Existing Boiler Location data is free text

Distinct values on K&N customers: `kitchen` (3), `landing` (1). Lowercase, unconstrained — consistent with a free-text origin, and there is no lookup table or settings column anywhere for boiler locations (no match for a location list in `src/`, `settings`, or `org_price_list`).

## 4. Impact on BJ-0054 (Customer Detail → Boiler Information)

BJ-0054 as scoped adds a plain text input reading/writing `customers.boiler_location`, matching Step 2 exactly. Nothing in the codebase implies a dropdown, so as scoped the two surfaces stay consistent.

Decision needed before BJ-0054 is built: if you want Boiler Location to become a **controlled dropdown**, that is a separate, larger change — it needs an option source (hardcoded shared array vs. a new per-org lookup table + Settings tab like Boiler Brands), a migration path for existing lowercase free-text values, and the same control applied to Step 2, `AddCustomerSheet`, and Customer Detail together. Doing it after BJ-0054 ships would mean reworking the field twice.

## Recommendation

Ship BJ-0054 as a free-text field to match every other surface, or tell me to plan the dropdown standardisation first (shared `boilerLocations.ts` constant is the cheapest option; per-org table only if K&N wants to edit the list themselves).
