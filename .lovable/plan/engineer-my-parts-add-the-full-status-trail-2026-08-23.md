# Engineer "My Parts" — add the full status trail

## Answer first: it is NOT included

The engineer app's My Parts screen does not have the trail treatment. Confirmed by reading the code:

- `PartStatusTrail` is currently imported in exactly three places: `CustomerPartsHistory.tsx`, and twice in `JobDetail.tsx` (active + history groups).
- The engineer card (`src/components/engineer/PartRequestCard.tsx`) shows only the logged timestamp plus a single latest-status stamp (`formatPartStatusStamp`) — one line, latest stage only. An engineer looking at a "Ready to Fit" part cannot see when it was logged or ordered.

So the office/customer surfaces have the full history and the engineer surface does not. Scoping and implementing it now, before this closes.

## What changes

On every card in My Parts, replace the single latest-status stamp with the same shared trail component the customer record and Job Detail use:

```text
Ready to Fit                         [status pill]
Mary Byrne
new burner · x1
[Urgent]
  Logged      11 Aug 2026, 3:23pm
  Ordered     11 Aug 2026, 3:26pm
  Ready to fit 11 Aug 2026, 3:29pm
```

Cancelled parts show Logged → Ordered → Cancelled in the same way, so a cancelled request still reads correctly weeks later.

Everything else on the card stays exactly as it is: job reference link, customer name, description, priority pill, office-update note block, and the Cancel Request flow.

## Scope boundaries

- One component touched. No database changes, no migration, no backfill — all four timestamps (`created_at`, `ordered_at`, `ready_at`, `cancelled_at`) already exist and are already selected by the screen's `select("*")`.
- No new status. Statuses stay Open / Ordered / Ready to Fit / Cancelled.
- No change to the office Parts page, the customer record, or Job Detail — those already have the trail.

## Technical notes

- `src/components/engineer/PartRequestCard.tsx`
  - Import `PartStatusTrail` from `@/components/parts/PartStatusTrail` — reuse, do not reimplement, so the three surfaces cannot drift.
  - Render `<PartStatusTrail row={row} className="pt-2 border-t border-border/60" />` below the priority/meta row.
  - Drop the `formatPartStatusStamp` line and its now-unused import from this file (the helper stays in `partsDates.ts` for other callers).
  - The trail self-hides when no stage has a timestamp, so nothing regresses for sparse rows.
- Trail label/colour mapping and timestamp formatting come from the existing `buildPartStatusTrail` + `formatPartTimestamp`, so labels and dot colours match the office surfaces exactly.

## Verification

- Signed-in Playwright pass on the engineer My Parts screen, screenshot showing a multi-stage part (logged → ordered → ready) and a cancelled part with its full trail.
- Confirm the Cancel Request button and office-note block still render and work.
- Typecheck clean, no console errors.
