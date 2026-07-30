## Audit: where customer GPRN is selected / rendered

Confirmed by search. Only `customers.gprn` surfaces are listed (certificate-level GPRN is separate).

| # | Surface | Select | Render |
|---|---------|--------|--------|
| A | Jobs detail page — "Job Information" card | `src/pages/JobDetail.tsx:372` (type at :75-77) | `src/pages/JobDetail.tsx:568` (GPRN), boiler model at :599-600 |
| B | Schedule slide-out panel | `src/pages/Schedule.tsx:171` (map :184, type :89) | `src/components/schedule/JobSlotDrawer.tsx:114-115` |
| C | Incoming job review panel | `src/pages/IncomingJobs.tsx:83` | `src/components/incoming/JobReviewPanel.tsx:266` (boiler model :275) |
| D | Engineer job detail | `EngineerJobDetail.tsx:128` uses `customers.select("*")` — already returns `boiler_location` | `src/pages/engineer/EngineerJobDetail.tsx:736` |
| E | Engineer job detail sheet | `src/hooks/useEngineerJobs.ts:69` uses `customers.select("*")` — already returns it | `src/components/engineer/JobDetailSheet.tsx:98` |

Note: contrary to the earlier assumption, the Schedule panel (B) does **not** yet carry `boiler_location` — no reference to it exists anywhere outside `NewJobPanel.tsx` and the generated types. So all five surfaces need the display field.

Not touched (out of scope): `CustomerDetail.tsx:396` (editable customer form), `ImportCustomers.tsx`, `NewJobPanel.tsx`, `Customers.tsx` search, and the cert-level GPRN in `JobCertsTab.tsx` / `EngineerCertificates.tsx` / cert flows.

## Changes

Every added field is read-only text, rendered only when the value is non-blank.

1. **A — `src/pages/JobDetail.tsx`**: add `boiler_location` to the customer type and to the `.select(...)` at line 372; render a `Boiler Location:` row in the same `<div><span className="text-muted-foreground">…` style directly after the Boiler Model row (line 600), wrapped in the same `{customer.boiler_location && (...)}` conditional.

2. **B — `src/pages/Schedule.tsx` + `JobSlotDrawer.tsx`**: add `boiler_location` to the nested `customers(...)` select at line 171, map it to `customer_boiler_location` alongside line 184, add the field to the job type at line 89; in `JobSlotDrawer.tsx` render a label/value block matching lines 114-115, conditional on a non-blank value, placed next to the existing boiler fields.

3. **C — `src/pages/IncomingJobs.tsx` + `JobReviewPanel.tsx`**: add `boiler_location` to the nested customers select at line 83 and to the customer type in `JobReviewPanel.tsx:53`; render a `Boiler Location:` row after the Model row (line 275) in the same style, conditional.

4. **D — `src/pages/engineer/EngineerJobDetail.tsx`**: no query change (uses `select("*")`). Add a conditional `<InfoTile label="Boiler Location" value={customer.boiler_location} Icon={…} />` near the existing boiler tiles, using an existing imported Lucide icon.

5. **E — `src/components/engineer/JobDetailSheet.tsx`**: no query change. Add a conditional `<InfoTile label="Boiler Location" value={customer.boiler_location} icon="📍" />` after Boiler Model (line 102), following the same `{job.boiler_type && …}` conditional pattern used nearby.

## Verification

- Typecheck.
- Load a job with a populated `customers.boiler_location` and confirm it appears on each of the five surfaces; load one with a null value and confirm the row is absent (not "—").
- Confirm no existing field on those cards shifted or disappeared.
