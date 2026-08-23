# BJ-0058 — Fully paid jobs leave Today's active list

Client-side filter change in one file: `src/hooks/useEngineerJobs.ts`. No status writes, no `buildPaymentPatch`, no Edge Function, no webhook, no trigger, no new subscription.

## The change

`todayActive` (line 615) gains one condition so a job that is fully paid drops out of the active list even though its status is unchanged:

```
todayActive = sortByTime(todayJobs.filter((j) =>
  j.status !== "Completed"
  && j.status !== "Cancelled"
  && !(Number(j.balance_due) <= 0 && j.payment_status === "paid")
));
```

`todayCompleted`, `todayCancelled`, `todayInProgress`, `upcomingJobs` and `completedJobs` are untouched.

## Semantics check (no-charge jobs)

Confirmed against live data: `payment_status` values in use are `unpaid` (393 rows), `paid` (111), `partial` (7), `pending` (2). Unpriced / never-charged jobs sit at `unpaid` — 188 of the `unpaid` rows have `revenue = 0`, and 345 have `balance_due` NULL. Because the new condition requires `payment_status === "paid"`, a €0 job that was never charged stays in the active list. `Number(null) <= 0` is true, so the `paid` half of the condition is what carries the exclusion — jobs marked paid with a NULL balance (41 rows exist) are also excluded, which is the intended "nothing outstanding" case.

## One consequence handled

`todayCompleted` keys on `status === "Completed"`, so a job excluded by the new filter appears in **no** Today section: not Active, not Completed, not Cancelled. The engineer would lose the route into the Complete form for that job from Today's Jobs.

Chosen approach: **Option B with a distinct grouping**. Paid-but-not-completed jobs get their own small section in `EngineerToday.tsx` (e.g. "Paid — Needs Completion"), separate from the `todayCompleted` "Completed" section, so engineers can still tap into the existing Complete form but cannot confuse them with fully closed jobs.

Note: this grouping is a UI-only change in `EngineerToday.tsx`. Combined with the filter change in `useEngineerJobs.ts`, **two files** are touched. If the single-file constraint is strict, the only way is Option A (filter only, with the lost-route tradeoff).



## Verification

- Vitest run for the touched module's existing tests.
- Playwright against the preview signed in as an engineer: scratch job scheduled today, take full payment by cash from the job card, then screenshot Today's Jobs showing the job gone from Active and the "Next Job" badge moved to the following job — with no Complete or status button pressed.
- Confirm via `git diff` that `src/hooks/useEngineerJobs.ts` is the only changed file.
