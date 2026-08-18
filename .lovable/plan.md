# Show the customer receipt note on completed engineer job cards

## Audit findings (read-only, confirmed)

- Page: **Completed Jobs** — `src/pages/engineer/EngineerCompleted.tsx`, route `/engineer/completed` (nested under `EngineerLayout` in `src/App.tsx`). It renders one `EngineerJobCard` per job from `completedJobs`.
- Data: `src/hooks/useEngineerJobs.ts` fetches completed jobs with `.select("*")` on `service_calls` (status `Completed`, own `assigned_engineer_id`, limit 30). So `customer_facing_notes` **is** in the data the page receives — this is not a missing-select problem.
- Rendering: `EngineerJobCard.tsx` never references `customer_facing_notes`. That is the whole reason it isn't visible.
- Other notes shown for comparison: `job.notes` (the "Work done: …" internal summary) appears via `JobNotesSection` (labelled "Job Notes"), plus `customer_call_notes` rows for the customer; `JobDetailSheet` shows `job.notes`, `job.access_notes`, `customer.access_notes`. None of these is the receipt note.
- KN-485 receives `customer_facing_notes = "Boiler serviced and left in good working order."` and `notes = "Work done: Full service completed - scratch audit test"` — the receipt note is present in the row and simply not rendered. (Two other jobs also have it populated: KN-103, DU-008.)

## Change

Add a read-only block on the engineer job card, shown only when `job.customer_facing_notes` has content:

```text
Notes for customer receipt
Boiler serviced and left in good working order.
```

- Placed just below the existing tags / last-service rows and above the Issue block, so it reads with the rest of the job summary.
- Styled with the same customer-facing tint already used for the receipt note on the completion sheet (semantic tokens, no hardcoded colours), a small `Receipt` Lucide icon, label in the existing muted-bold style, body text `whitespace-pre-wrap`.
- Read-only: no textarea, no save action.
- Appears on any card with the field populated (Completed, and also Today/Upcoming if a note exists), because the card is shared.

## Technical notes

- Single file: `src/components/engineer/EngineerJobCard.tsx` — one conditional block reading `job.customer_facing_notes`. No new query, no hook change, no data writes.
- No change to `useEngineerJobs.ts` (already `select("*")`), `JobNotesSection`, `CompleteSheet`, or the receipt/PDF path.

## Verification

- Open `/engineer/completed` as the engineer assigned to KN-485: the note block renders with the expected text.
- A completed job with `customer_facing_notes` null (e.g. KN-475) shows no block and no empty box.
- Confirm the internal "Job Notes" section, tags, payment/receipt buttons and Take Payment flow are unchanged, and no console errors on a mobile viewport.
