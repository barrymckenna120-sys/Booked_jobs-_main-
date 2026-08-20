# Engineer job card "New Customer" badge

Add an emerald "New Customer" pill to the engineer-facing job card, rendered only when `customer_status_at_booking === 'new'`.

## What changes

1. Confirm fetch coverage
   - `src/hooks/useEngineerJobs.ts` already queries `service_calls` with `.select("*")`, so `customer_status_at_booking` is present on every job object passed to the card. No select-list change is required.

2. Update `src/components/engineer/job-card/InfoPills.tsx`
   - Add optional prop `customerStatusAtBooking?: string | null`.
   - Inside the existing pill row (`flex flex-wrap gap-2`), conditionally render a pill when `customerStatusAtBooking === "new"`.
   - Styling: emerald tone distinct from the existing blue date/job-type pills and amber payment banners, e.g. `bg-emerald-500/15 text-emerald-600 border-emerald-500/20 rounded-full px-2.5 py-0.5 text-xs font-semibold`.
   - Label: "New Customer".

3. Wire `src/components/engineer/EngineerJobCard.tsx`
   - Pass `customerStatusAtBooking={job.customer_status_at_booking}` to the `<InfoPills />` call.
   - No other props or logic are touched.

## What does not change

- Payment logic, deposit pills, balance lines, and `PrimaryActions` / `SecondaryActions` / `QuickActions` are untouched.
- `SERVICE_CALL_BASE_SELECT` in `src/types/service-calls.ts` is not modified (the engineer path uses `*`).
- Office/schedule cards are not modified.

## Verification

- Typecheck passes.
- In the engineer preview, a job with `customer_status_at_booking = 'new'` shows the emerald "New Customer" pill in the same row as the date and job-type pills.
- Jobs with `'existing'` or `null` show no badge.
