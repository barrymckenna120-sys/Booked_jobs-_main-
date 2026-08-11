# Rebooking badge on the engineer job card

Add the same amber "rebooking" indicator used on the office Unallocated Jobs board to the engineer-facing job card, shown only for jobs that came from a renewal.

## What changes

Single file: `src/components/engineer/EngineerJobCard.tsx`.

- Add an icon-only amber pill (Lucide `RotateCw`, size 12) in the card header row, directly beside the existing status pill (`Booked` / `Pending` / etc.).
- Render it only when `job.source === "Renewal"`. No other source value shows it.
- Everything else on the card is untouched: status pill, job-type tag, Last Service, Engineer, and all Call / WhatsApp / Nav / Details / Certificates buttons.
- No changes to any file under `src/components/engineer/job-card/`, and no changes to any other component or page.

## Placement note

On this screen the status pill sits in the header row (job ref + customer name), while the job-type tag sits one row below inside `InfoPills`, which is off-limits. Per your choice, the badge goes in the header row next to the status pill.

## Technical details

- `useEngineerJobs.ts` already fetches `service_calls` with `.select("*")`, so `source` is present on the job object — no data-plumbing or query change is needed.
- Badge markup matches the existing header pill sizing (`rounded-full`, small padding, `shrink-0`) with amber tokens, plus `title` / `aria-label` of "Rebooking (Renewal)" for accessibility since there is no text.
- Import `RotateCw` from `lucide-react` alongside the existing icon imports.

## Verification

- Typecheck.
- Load the engineer view in the browser against a job with `source = "Renewal"` and confirm the badge appears; confirm it is absent on jobs with other sources. If no renewal job is currently in an engineer's active list, temporarily adjust one job's state to bring it onto the board, verify, then restore it exactly as it was.
