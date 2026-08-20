# "New Customer" badge across office surfaces

Current state (verified): the badge exists only in the engineer app (`src/components/engineer/job-card/InfoPills.tsx`). `UnallocatedJobs.tsx` still renders the old 24h-freshness "New" badge, and `ScheduleJob` does not carry `customer_status_at_booking`.

## What to build

One shared badge component, reused on five surfaces. Emerald styling, `UserPlus` icon, label "New Customer", rendered only when the job's `customer_status_at_booking === 'new'`.

1. **Unallocated panel** — replace the 24h `isNew(created_at)` badge with the real one; delete the `isNew` helper.
2. **Calendar / weekly grid cards** — add the badge next to the existing job-type/media badges (both card layouts in `WeeklyGrid.tsx`).
3. **Job detail view** — add next to the existing type/status/confirmed badges in the header, plus the schedule drawer card.
4. **Jobs list page** — badge beside the customer name (table row and mobile card), and a new "All Customers / New / Existing" filter dropdown alongside the status and type filters.
5. **Customers list page** — derived badge beside the customer name: shown only when that customer has exactly one job total and that job has `customer_status_at_booking = 'new'`. Computed from the already-fetched job rows; nothing new stored.

Explicitly out of scope: the Customer profile page.

## Technical notes

- New `src/components/jobs/NewCustomerBadge.tsx` (props: `status`, optional `size`/`className`); the engineer pill keeps its current inline rendering untouched.
- `src/pages/Schedule.tsx`: add `customer_status_at_booking` to the `ScheduleJob` type and the row mapping (the query is already `.select("*")`, no query change needed).
- `src/pages/Jobs.tsx`: add the field to the `Job` type (query is `.select("*")`), a `customerStatusFilter` state wired into `applyFilters`.
- `src/pages/Customers.tsx`: extend the existing `service_calls` job-count query to also select `customer_status_at_booking`, and derive a `newCustomerIds` set (count === 1 && status === 'new').
- No payment, scheduling, or RLS logic touched; presentation only.

## Verification

- Typecheck output pasted raw.
- Playwright click-through on KN-511 ("ZZ Scratch Boiler manual"): one screenshot each for unallocated panel (if it appears there), calendar card, job detail, Jobs list, and Customers list for that customer.
