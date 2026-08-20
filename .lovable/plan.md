# Shared time_block Normaliser (standalone utility)

One small utility that understands every way a time slot has ever been written in this database, plus tests. Nothing is wired up to any screen in this step.

## Why

Production data holds 25 distinct `time_block` values, including three different dash/spacing styles, word labels, legacy short forms, three rows with a UUID, and 35 NULLs. Today each screen has its own partial label map, so sorting and display disagree.

## What gets built

New file `src/lib/timeBlock.ts` (matches the existing shared-utils convention — plain module in `src/lib`, test alongside as `src/lib/timeBlock.test.ts`).

Two exported functions:

1. `timeBlockStartMinutes(raw: string | null | undefined): number`
   - Returns minutes since midnight for the slot's start time.
   - Parses the first time token in the string, tolerant of `–`/`-`, stray spaces, `am`/`pm`, and optional `:MM`.
   - Word labels map to representative starts: Morning 08:00, Midday 11:00, Afternoon 14:00.
   - Legacy bare forms (`9–11`, `11–2`) resolve with a business-hours rule: hours 1–7 read as PM, 8–12 as AM.
   - NULL, empty, UUID, or otherwise unparseable input returns a large sentinel so those rows sort last. Never throws.

2. `timeBlockLabel(raw: string | null | undefined): string`
   - Canonical display label, consolidating the duplicated maps.
   - Recognised slots render in one house style (en dash, no spaces, e.g. `8am–11am`, `11am–1pm`, `2pm–5pm`).
   - Unrecognised-but-parseable values render from the parsed times rather than being dropped.
   - NULL/unparseable returns `"Unscheduled"`.

## Tests

`src/lib/timeBlock.test.ts` asserts against the full distinct-value list pulled from production, not a sample:

`2pm–5pm`, `8am–11am`, `9am–11am`, `9am-11am`, `11am–1pm`, `11am–2pm`, `8am-11am`, `Morning`, `2pm-5pm`, `Afternoon`, `Midday`, `2pm -5pm`, `1pm-3pm`, `10am-12pm`, `11am -1pm`, `2pm-4pm`, `9–11`, `11am-1pm`, `11–2`, `9am - 11am`, `8am-10am`, `9am-12pm`, a UUID value, `null`, and `""`.

Plus ordering assertions: a full-day mixed list sorts 8am → 9am → 10am → 11am → 1pm → 2pm, with NULL/UUID rows last.

## Out of scope

No changes to `useEngineerJobs.ts`, `EngineerUpcoming.tsx`, `DayJobsPanel.tsx`, `Schedule.tsx`, `WeeklyGrid.tsx`, `NewJobPanel.tsx`, any Edge Function, or any data. Wiring consumers and fixing writers are separate follow-ups.

## Verification

`bunx vitest run src/lib/timeBlock.test.ts` green, with one case per distinct production value.
