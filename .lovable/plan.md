# Engineer job card rebooking badge styling

Update the rebooking badge in `src/components/engineer/EngineerJobCard.tsx` so it exactly matches the amber pill styling used on the office Unallocated Jobs board.

## What changes

Single file: `src/components/engineer/EngineerJobCard.tsx`.

- Keep the badge in the header row, directly next to the existing `StatusBadge` pill.
- Keep the condition: render only when `job.source === "Renewal"`.
- Update the badge markup to use exactly these utility classes: `bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]` (matching the Unallocated Jobs board).
- Keep the Lucide `RotateCw` icon at size 12, icon only, no text.
- Keep `title` and `aria-label` as "Rebooking (Renewal)".

## What does not change

- No files under `src/components/engineer/job-card/` are touched.
- No other component or page changes.
- Status pill, job-type tag, Last Service, Engineer, and all buttons remain unchanged.

## Verification

- Typecheck.
- Confirm in the engineer preview that the badge appears on a renewal job, styled identically to the Unallocated Jobs board, and that non-renewal jobs have no badge.
