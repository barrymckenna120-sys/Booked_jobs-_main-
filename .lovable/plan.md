# BJ-0079 — Today's Jobs: card split and Next Job advance

Three sequenced steps. Each is a separate reviewed change; nothing else in the engineer app moves.

## Step 1 — Confirm the stale-cache cause (no code change)

Symptom A (all 4 jobs as full cards) cannot be produced by the current source: only one full card is ever rendered. The most likely cause is an old cached bundle on Karl's device.

- Karl opens the engineer app with `?sw=off` appended, then hard-reloads.
- Expected after reload: one full card (KN-516, the only unpaid/active job) plus a `PAID — NEEDS COMPLETION` section listing KN-514, KN-513, KN-491, KN-498 as compact rows.
- If that is what he sees, symptom A is closed as cache. If he still sees 4 full cards, stop and re-open the audit before touching code.

## Step 2 — Fix the Next Job look-ahead index

The displayed order is `sortedActive` (next job hoisted to the front), but the look-ahead walks `todayActive`. Once there are two or more active jobs this advances to the wrong job, and does nothing when the displayed job happens to be last in `todayActive`.

- In `src/pages/engineer/EngineerToday.tsx`, compute `displayedIndex` and `nextViewJob` against `sortedActive` instead of `todayActive`.
- Keep the existing behaviour where the button is hidden when there is no following job (this is why it is absent for Karl today — one active job only).

## Step 3 — Wire the time-block normaliser

`TIME_ORDER` and `TIME_RANGES` in `src/hooks/useEngineerJobs.ts` only know `9am–11am`, `11am–1pm`, `2pm–5pm`. Real rows use `8am–11am` and `11am–2pm`, which sort last (weight 99) and miss block matching in `getNextJobId`, falling through to a generic first-active fallback.

- Use the existing `src/lib/timeBlock.ts` normaliser for both sorting and `getNextJobId` block comparison, so any block spelling maps to a start/end hour.
- Extend the existing `timeBlock.ts` test suite with the real-world blocks seen in production data.

## Technical notes

- Files touched: `src/pages/engineer/EngineerToday.tsx` (Step 2), `src/hooks/useEngineerJobs.ts` and `src/lib/timeBlock.ts` tests (Step 3).
- No database writes in any step.
- BJ-0058 grouping (`todayPaidNeedsCompletion`) stays exactly as it is — it is behaving correctly.
- Verification per step: typecheck plus build, unit tests for Step 3, and a click-through of Today's Jobs for an engineer with 2+ active jobs to confirm Next Job walks display order.
