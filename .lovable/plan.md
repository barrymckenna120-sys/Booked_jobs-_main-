BJ-0054: Add Boiler Location to CustomerDetail Boiler Information card

Scope: src/pages/CustomerDetail.tsx, Boiler Information card only.

Current state (verified by reading source):
- The `customers.boiler_location` column exists and is already typed in `src/integrations/supabase/types.ts`.
- CustomerDetail.tsx fetches the full customer row (`select("*")` at line 171), so `form.boiler_location` is already available in state.
- The Boiler Information card (lines 449–692) currently shows: Boiler Brand, Boiler Model, Boiler Type, Installation Date, Warranty Years, Warranty Expiry, Warranty Status. It does **not** show Boiler Location.
- Save path is generic: `handleChange` mutates `form`, and `buildCustomerUpdatePayload(form, originalForm)` at line 227 will include `boiler_location` if changed. No special save wiring is needed.

Plan
1. Add a "Boiler Location" field to the Boiler Information card in `CustomerDetail.tsx`, placed after Boiler Model and before Boiler Type (or immediately after, depending on logical grouping). Use the same `space-y-1.5` wrapper, `Label`, and `Input` pattern as the existing Boiler Brand/Model fields.
2. Bind it to `form.boiler_location` with `handleChange("boiler_location", value)`. No validation is required beyond the implicit max-length on the Input; mirror the existing brand/model fields.
3. Verify the change compiles and the field appears and persists in the preview.
4. No database migration is required.

Boiler Location audit across display surfaces
Surfaces that already show Boiler Location:
- JobDetail.tsx (customer header) — yes
- IncomingJobs.tsx / JobReviewPanel.tsx — yes
- EngineerJobDetail.tsx (engineer mobile view) — yes
- Engineer JobDetailSheet.tsx — yes
- Schedule.tsx / JobSlotDrawer.tsx (schedule job card panel) — yes
- NewJobPanel.tsx (New Job wizard) — yes

Surfaces that still lack Boiler Location:
- CustomerDetail.tsx Boiler Information card — this is the target fix.
- AddCustomerSheet.tsx — intentionally minimal; it only has Boiler Type, Owner/Tenant, and Warranty Years, with no Brand/Model/Location/Installation Date fields. Out of scope for this card unless you want to expand the add-form boiler section.
- Import/Export flows (ImportCustomers.tsx, DataTab export, generateTemplate.ts) — these are data import/export templates, not display screens; they do not currently include boiler_location.
