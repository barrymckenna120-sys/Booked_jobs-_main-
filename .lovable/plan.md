# Customer Export — Select, Preview, then Export

Today "Export to Excel" in Settings → Data downloads every customer instantly. This adds a Select → Preview → Export flow modelled on the existing Import screen. The formatting work already done is reused untouched.

## Pre-work report (as requested)

**Current export:** `handleExport` inside `src/components/settings/DataTab.tsx` — fetches all non-archived customers, maps 20 columns through `src/lib/customerExportFormat.ts`, forces Phone/Eircode/GPRN/Area Code to text cells, writes the file.

**Import pieces reused:** `src/pages/ImportCustomers.tsx` supplies the page shell, Card + Table preview layout, checkbox column with header select-all, count badges and footer action bar. Copied as patterns into the new screen; the Import page itself is not refactored.

**Selection storage:** in-memory `Set<string>` of customer ids on the new screen. Survives search and filter changes because it is keyed by id, not by row position.

**Select All with pagination:** the list is fetched once per organisation with a light column set, then filtered and paged in the browser. So "Select all" always means *all customers matching the current filters* (not just the visible page), and the label states the number explicitly. Page size 25 with prev/next, same as the Customers list.

**Database/schema change:** none.

**Column comparison (nothing removed).** Existing 20 columns stay. Customer Profile fields not currently exported: Landline, Owner/Tenant, Customer Type, Boiler Location, Boiler Age, Warranty Years, Warranty Expiry Date, Renewal Stage, Scheduled Service Date, Last Reminder Sent, Reminders/WhatsApp consent, Opted Out, Source, Job Tag. Proposal: add only **Renewal Stage** and **Warranty Expiry Date** (both shown in the selection table / relevant to renewals) and leave the rest out unless you want them. Say the word and I'll include any of the others.

## The screen

New route `/settings/export` (page `src/pages/ExportCustomers.tsx`); the Data tab button navigates there instead of downloading.

**Step 1 — Select**
- Header: `120 customers` and a live `34 selected`, plus a line naming the filters currently applied.
- Search box "Search customers…" matching name, mobile, address, Eircode and GPRN.
- Filters: Service Status (All / Up to Date / Due Soon / Overdue / Serviced), Renewal Stage (All / Not Contacted / Reminded / Confirmed / Booked In / Paid), Area Code (All + the area codes actually present for that organisation). No new status values invented.
- Table columns: checkbox, Customer Name, Mobile, Address, Eircode, Area Code, Service Status, Next Service Due, Renewal Stage.
- Header checkbox selects/clears every customer matching the current filters, labelled so it is unambiguous.
- Footer: `Preview Export →`, disabled at zero selected.

**Step 2 — Preview**
- Same table styling, showing the exact formatted rows that go into the file — produced by the same helper functions the writer uses, so `D24W289 → D24 W289`, `D24W → D24`, `active → Up to Date`, dates `YYYY-MM-DD`, phone/GPRN identical.
- Heading `34 customers selected for export`.
- Footer: `← Back to Selection` and `Export 34 Customers to Excel`, or `Export All 120 Customers to Excel` when everything is selected. Never enabled at zero.

## Technical notes

- Fetch: `customers` with `organisation_id = orgId`, `is_archived = false`, selecting only the exported columns — no jobs, payments or message history. Tenant scoping comes from the existing RLS policy plus the org filter; selected ids are intersected with the fetched (already scoped) set before the file is written, so a frontend-supplied id can never widen the result.
- Row building moves into a shared `buildExportRows(customers)` in `src/lib/customerExportFormat.ts` (pure), used by both the preview and the sheet writer, so the two cannot drift. The existing per-field helpers and the text-cell forcing are unchanged.
- Sheet writing (`xlsx-js-style`, column widths, text columns) moves to a small `exportCustomersToExcel(rows)` helper called from the new page.

## Files

- `src/pages/ExportCustomers.tsx` (new)
- `src/lib/customerExportFormat.ts` (add `buildExportRows`, unchanged helpers)
- `src/lib/customerExportWorkbook.ts` (new — sheet writing)
- `src/components/settings/DataTab.tsx` (button navigates)
- `src/App.tsx` (route)

## Tests

`src/lib/__tests__/customerExportFormat.test.ts` extended, plus a new selection/filter test file for the pure helpers: one customer, several, all, search-then-select, select-then-search keeps selection, filter-then-select, clear filter keeps selection, zero selected blocks export, preview row count equals written row count, preview values equal written values, ids outside the fetched org set are dropped, and a 5,000-row filter/select-all timing check.

Manual: click through the flow in Settings → Data, confirm counts, filters and the downloaded file.

Risk: Low — one settings screen, no database, schema, RLS or import changes.
