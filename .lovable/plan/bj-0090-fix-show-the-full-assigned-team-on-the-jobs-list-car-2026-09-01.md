# BJ-0090 fix: show the full assigned team on the Jobs list card

## What's wrong

Confirmed in the database: KN-533 (Aoife Walsh, Installation) has Barry as the lead on the job row and Karl + nicole recorded as assists in the assists table. So the data is correct.

The Jobs list only ever reads the single lead-engineer name stored on the job itself. It never loads the assists table, so Karl and nicole cannot appear anywhere on the card. Today the engineer-side job card is the only place that reads assists.

## What will change (Jobs list only)

Both layouts of the Jobs list get the whole team instead of one name:

- Mobile/tablet job card, the engineer row: replace the single name with a stacked list, one line per person:
  - `Barry — Lead`
  - `Karl — Assistant`
  - `nicole — Assistant`
  The existing initials avatar stays on the lead line; assist lines are a smaller muted line beneath. Unassigned jobs still read "Unassigned".
- Desktop table, Engineer column: lead name on the first line with a small `Lead` label, assists listed underneath as `Name — Assistant`. Jobs with no assists look exactly as they do now (single name, no label noise).

Labels are purely job-role based: the lead is `Lead`, everyone in the assists table is `Assistant`, regardless of their Team settings role.

Nothing else on the card changes — status, payment, badges, dates, contact links, ordering and filters all stay as-is. No other screen is touched in this task.

## Technical notes

- Add one batched lookup in `src/pages/Jobs.tsx`: a single `job_engineers` select joined to `engineers` filtered by `job_id in (visible job ids)`, keyed in React Query on the sorted id list, then grouped into a `Map<jobId, {id, name}[]>`. One request per page of jobs, not one per card.
- Render helper local to `Jobs.tsx` used by both `renderJobsTable` and the mobile card, so the two layouts can't drift.
- Cards render immediately; assists appear when the lookup resolves (no loading spinner, no layout jump beyond the added lines).
- Assist rows are already readable by office/admin under the existing `job_engineers` policies, so no migration and no policy change is needed.
- Regression test: a small unit test for the grouping/label helper (lead-only job yields one line with no assist lines; lead + 2 assists yields three correctly labelled lines).

## Verification

- Typecheck plus the new unit test.
- Live check on KN-533 in the Jobs list (desktop table and mobile card) showing Barry — Lead, Karl — Assistant, nicole — Assistant, and a lead-only job nearby still showing a single name.
