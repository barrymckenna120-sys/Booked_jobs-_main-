# Boiler Enquiries list — tabbed status view

## Conflict to settle first

A boiler enquiries list page **already exists** and `/boiler-enquiries` is **already registered** as an office-only route (`src/pages/BoilerEnquiries.tsx`, built in Phase 3B). It has a search box, four dropdown filters and a table, but no status tabs with counts and no linked-quote column.

So "create a new page only, do not modify any existing file" and "add a new route /boiler-enquiries" cannot both hold. This plan takes the least invasive route that still gives you a new file:

- Create a **new** page file with the tabs/counts/table pattern.
- Change **one line** in `src/App.tsx` so the existing `/boiler-enquiries` route renders the new page.
- Leave the old page file on disk, unmodified, no longer referenced — easy to revert by flipping that one line back.

If you would rather I rewrite the existing page in place, or keep both under separate URLs, say so and I'll adjust.

## Status tabs

The database allows seven statuses: NEW, CONTACTED, NEEDS_INFO, READY_TO_QUOTE, QUOTED, WON, LOST. You asked for six tabs (All / New / Contacted / Quoted / Won / Lost), which leaves NEEDS_INFO and READY_TO_QUOTE reachable only under All. Plan: show tabs for all seven so no enquiry is hard to find, with All first and each tab carrying its count. Tell me if you want strictly your six.

## What gets built

New page `src/pages/BoilerEnquiriesList.tsx`, following the `QuotesList.tsx` conventions (same tab pill row with counts, same search input, same card-wrapped table, same badge styling approach, same loading spinner and empty state):

- Tab row: All plus each status, each with a live count from the loaded set.
- Search box filtering by customer name or phone (both the linked customer record and the enquiry's own contact fields).
- Table columns: Customer (name with phone beneath), Enquiry / Property type, Timeframe, Status (coloured badge), Quote (linked quote number plus its status badge, or a dash), Source (source / external source), Created (DD/MM/YY).
- Mobile card layout mirroring the existing page, so small screens stay usable.
- Row click navigates to `/boiler-enquiries/:id` — the detail page is untouched.

Linked quotes are loaded with one query over the visible enquiry ids (`quotes` filtered by `boiler_enquiry_id`), the same relationship the detail page already uses; the most recent quote per enquiry is shown.

## Data access

Read-only. No new tables, columns, functions or policies. Existing row-level security already restricts `boiler_enquiries` and `quotes` to the signed-in user's own company via `get_my_org_id()`, and the route stays behind the office-only guard, so engineers cannot reach it.

## Verification

Type check, production build, and the existing test suite. Click-through of the tabs, search, empty state and a row into the detail page against the six live enquiries.

## Files

- New: `src/pages/BoilerEnquiriesList.tsx`
- One-line change: `src/App.tsx` (lazy import target for the `/boiler-enquiries` route)
- Unchanged: `src/pages/BoilerEnquiryDetail.tsx`, `src/pages/BoilerEnquiries.tsx`, all backend code
