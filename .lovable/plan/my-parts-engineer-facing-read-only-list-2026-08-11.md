# My Parts — engineer-facing read-only list

A second tab inside the engineer's Completed section: **Job History / My Parts**. Engineer screens only. No changes to `parts_requests` structure, no RLS changes, no office/admin components.

## Where it lives

New route `/engineer/parts` under the existing `EngineerLayout`. The bottom nav keeps its four items unchanged — `/engineer/parts` maps to the same **Completed** nav item, so that icon stays highlighted while My Parts is open. A segmented control sits at the top of both screens:

```text
[ Job History | My Parts ]
```

Tapping a segment navigates between `/engineer/completed` and `/engineer/parts`. Both screens render the same control, so the pair reads as one section.

## Query

```text
select * from parts_requests
where engineer_id = <auth uid> or assigned_engineer_id = <auth uid>
order by created_at desc
```

Both columns are `uuid` FKs to `profiles(user_id)`, which is the value `auth.uid()` returns, so the current user's id is used directly with no lookup. The legacy `assigned_to` (an `engineers.id`) is **not** queried. Org scoping comes from the existing RLS policies; no client-side org filter is added.

Job references are not on `parts_requests`, so a second lookup fetches the reference from `service_calls` for the distinct non-null `service_call_id` values and maps them onto the rows.

Column name verified against `information_schema.columns` before planning: the human-readable reference is **`job_reference`** (`text`) on `public.service_calls` — live values `KN-462`, `KN-461`, `KN-460`. The only other reference-style columns on that table are `receipt_number` and `invoice_number`, neither of which is the job ref. `job_reference` is used throughout.


## Each row shows, in this order

1. **Job reference** from the linked job, or `No job linked` when `service_call_id` is null
2. **customer_name**
3. **description**
4. **Status badge** — Open / Ordered / Ready to Fit / Cancelled, using the existing `PART_STATUS_CONFIG` colours. Icons: `Clock` (Open), `Truck` (Ordered), **`PackageCheck`** (Ready to Fit), `XCircle` (Cancelled). `PackageCheck` is a box-with-tick glyph and is not used anywhere in the app today; the job's own Complete action uses `CheckCircle2`, which is deliberately avoided here so the two never read as the same state.
5. **priority** — existing `PART_PRIORITY_CONFIG` pill (Urgent / Normal / Low)
6. **created_at** — short date via `date-fns` `format`, matching the engineer screens' existing style, with "Today"/"Yesterday" for recent rows
7. **notes block**, when `notes` is present — see below

## The notes / "Update from office" distinction

When `notes` is present the row renders a small note block. Its framing depends on whether office has touched the request since it was created:

- `updated_at > created_at` **and** `status != 'Open'` → labelled **"Update from office"**, with the office-tinted treatment, so the engineer reads it as something changed on their behalf.
- Otherwise → presented as the request's own note, no office label.

A small tolerance (a couple of seconds) is applied to the `updated_at > created_at` comparison so the insert's own timestamp jitter doesn't mislabel a brand-new row as an office update.

Worth stating plainly: this heuristic infers authorship from timestamps and status, because the table has no "who wrote this note" column and this prompt doesn't add one. It is right for the normal flow (engineer logs a request, office later edits it) but it cannot distinguish an office note from an office status change that left the note alone — both show the same label. A `notes_updated_by` column would make it exact; that's a schema change for a later prompt.

## Read-only

No status controls, no cancel action, no writes at all from this screen. Rows are not tappable beyond the job reference, which links to the linked job's detail screen when one exists.

Empty state: a package icon with "No parts requests yet". Expect this for every engineer initially — all 9 existing rows predate `engineer_id`/`assigned_engineer_id` and have both NULL, so nothing matches until new requests are logged. No backfill is included.

## Files

- `src/pages/engineer/EngineerParts.tsx` — new screen, query, list, empty and loading states
- `src/components/engineer/PartsSectionTabs.tsx` — new shared segmented control
- `src/components/engineer/PartRequestCard.tsx` — new row card
- `src/pages/engineer/EngineerCompleted.tsx` — render the segmented control above the existing list; list itself untouched
- `src/components/engineer/EngineerLayout.tsx` — treat `/engineer/parts` as the Completed tab for nav highlighting
- `src/App.tsx` — register the `parts` child route
- `src/lib/partsStatus.ts` — add the status-icon map and the pure `isOfficeUpdate(row)` helper
- `src/lib/partsStatus.test.ts` — unit tests for `isOfficeUpdate` (new row, office-updated row, Open-but-updated row, timestamp jitter) and the status/icon map

## Verification

Unit tests for the pure helpers, then a Playwright pass on `/engineer/parts` signed in as the test engineer: empty state, then a temporary row per status to confirm badges, icons, ordering, "No job linked", and both note framings render correctly — temp rows removed afterwards.
