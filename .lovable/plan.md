# Ready to Fit gets its own glyph — icon-only pass

Goal: at a glance, a part that is "Ready to Fit" must never look like the job's "Mark Complete" action. Icon glyphs only — no colour, copy, layout, data, or logic changes.

## Current state (verified)

- `src/lib/partsStatus.ts` already maps statuses to glyph keys: Open → Clock, Ordered → Truck, Ready to Fit → PackageCheck, Cancelled → XCircle.
- Engineer `PartRequestCard.tsx` already renders that glyph in the status pill — correct, no change needed.
- `src/pages/Parts.tsx` and `src/components/dashboard/PartsPanel.tsx` already use `PackageCheck` on their Ready-to-Fit action buttons.
- Job "Complete" actions elsewhere use `CheckCircle2` (`JobDetail.tsx` Mark Complete, engineer `CompleteSheet`) — visually distinct from `PackageCheck`, and untouched.

Two gaps remain on office-side Parts surfaces:

1. `src/pages/JobDetail.tsx` — the "Part Arrived" button (advances a part to Ready to Fit) uses `CalendarClock`, a scheduling glyph, not the box-with-check.
2. Office-side parts status pills render label text with no glyph at all — `JobDetail.tsx`, `src/pages/Parts.tsx`, `src/components/dashboard/PartsPanel.tsx` — so the status reads differently to the engineer card.

## Changes

1. `src/pages/JobDetail.tsx`: "Part Arrived" button icon `CalendarClock` → `PackageCheck`. The separate "Tell customer parts arrived" button keeps `CalendarClock` — it is a messaging action, not a status.
2. Add the status glyph to the parts status pill in the three office surfaces, reusing the existing `PART_STATUS_ICON_KEY` map (same glyph set the engineer card uses) so Open/Ordered/Ready to Fit/Cancelled read identically on both sides. Pill colours, labels, sizes and spacing stay exactly as they are; only an icon is added before the label.

Nothing outside Parts Requests status display is touched. No database, RLS, query, or status-transition changes.

## Technical notes

- A small shared icon lookup (status key → Lucide component) will be introduced so the three office files and the engineer card resolve glyphs from one place, rather than each file re-declaring an `ICONS` record.
- Verification: run the existing `partsStatus` / `partsRequests` unit tests, typecheck, and take Playwright screenshots of office Parts, the dashboard Parts panel, Job Detail parts section and engineer My Parts to confirm `PackageCheck` on Ready to Fit and `CheckCircle2` still on Mark Complete.
