# Rewrite Boiler Enquiries list — tabbed status view

## Current state (verified)

`src/pages/BoilerEnquiries.tsx` (266 lines) is the live `/boiler-enquiries` page, office-guarded, fetching `boiler_enquiries` joined to `customers`, RLS-scoped via the signed-in user's company. Its four dropdown filters filter on:

1. **Status** — `boiler_enquiries.status` (becomes redundant → replaced by tabs)
2. **Timeframe** — `installation_timeframe` (kept)
3. **Source** — `source` (kept)
4. **Heating** — `current_heating` (kept)

Allowed statuses (DB check constraint): NEW, CONTACTED, NEEDS_INFO, READY_TO_QUOTE, QUOTED, WON, LOST. Six enquiries currently exist, all NEW.

## What changes

**Rewrite `src/pages/BoilerEnquiries.tsx` in place** — same file, same route, same data, no new page, no `src/App.tsx` change. `BoilerEnquiryDetail.tsx` and all backend code untouched. Follow `QuotesList.tsx` conventions: same tab pill row with counts, search input, card-wrapped table, badge styling, `Loader2` spinner, empty state.

### Filters
- **Status dropdown: dropped** — superseded by the tab row (functionality preserved, relocated).
- **Timeframe, Source, Heating dropdowns: kept** as-is, sitting beside the search box, each with its "All" default.

### Tabs
One row of pills: **All** plus all seven statuses — New, Contacted, Needs Info, Ready to Quote, Quoted, Won, Lost — each with a live count from the loaded set. Counts always reflect the whole set (not the search-filtered subset), matching the existing "N new" behaviour.

### Search
Unchanged placement; matches customer name or phone from both the linked `customers` record and the enquiry's own contact fields (same haystack logic as today, narrowed to name/phone/email per spec: name + phone are the requirement, existing email matching stays).

### Table columns (desktop)
1. **Customer** — name (bold) with phone beneath
2. **Enquiry / Property type** — `property_type` (existing `enquiry_type`-style content)
3. **Timeframe** — `installation_timeframe`
4. **Status** — coloured badge, existing `STATUS_BADGE` mapping
5. **Quote** — most recent linked quote's number + its status badge; dash when none. Loaded with **one** query over the visible enquiry ids on `quotes.boiler_enquiry_id` (the same relationship `BoilerEnquiryDetail.tsx` already queries), then grouped client-side.
6. **Source** — `source` (falls back to `external_source` when blank)
7. **Created** — `created_at` as DD/MM/YY

### Mobile
Card layout mirroring the current page (customer + status badge, address line, property line, timeframe/source/date line) plus the quote number where one exists.

### Row click
Navigates to `/boiler-enquiries/:id` — detail page unchanged.

## Constraints

- Read-only data: no new tables, columns, functions or policy changes.
- Stays behind the existing office-only route guard; no route edits.
- One regression check after build: tab counts, a tab switch, search, empty state, row navigation to detail.

## Reporting

Full diff of the rewritten file, stating explicitly which of the four original filters were kept, merged or dropped and why.
