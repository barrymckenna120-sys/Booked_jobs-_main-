# Compact Rows — Job Reference + Job Details Audit

## Part 1 — Add job reference to compact rows (build this)

In `src/components/engineer/EngineerCompactJobRow.tsx`, show the job reference beside the customer name:

- Render `job.job_reference` (with the same `KN-<id slice>` fallback the full card uses) immediately after the customer name, separated by a middot: `Aisling Power · KN-487`.
- Muted styling (`text-[11px] font-mono text-muted-foreground/70`), `shrink-0` so the customer name keeps truncation priority and the row stays single-height on mobile.
- Nothing else in the row changes — time block, status chip, New Customer chip, deposit pill, address line and chevron all stay as they are.

### Verification
- Screenshot `REST OF DAY` at 390px showing references beside names, no wrapping.
- Tap a row, confirm it still lands on the correct job detail.
- Typecheck clean, no console errors.

## Part 2 — Audit findings (report only, no changes in this pass)

**1. Where a compact row navigates**
`navigate('/engineer/job/${job.id}')` → route `/engineer/job/:id` → `src/pages/engineer/EngineerJobDetail.tsx`. Identical target to the Next Job card's `openJobDetails()`.

**2. Do Service History / Photos & Videos / Messages render via a compact row?**
Yes. Both paths are plain URL navigations that pass **no** route state or props — `EngineerJobDetail` re-fetches everything from the database off `useParams().id` (`service_calls` by id, then customer, call notes, certificate, tags and `organisations.owner_user_id` in one parallel batch). The three sections render from `job.id` / `job.customer_id` / resolved `officeOwnerId`, so there is no behavioural difference between arriving from a compact row and arriving from the Next Job card. No gap here.

**3. What the card shows that the detail screen does not**

| Missing on detail | Source on card |
|---|---|
| "New Customer" chip | `InfoPills` via `customer_status_at_booking` |
| Renewal / rebooking badge | `job.source === 'Renewal'` |
| "Notes for customer receipt" block | `job.customer_facing_notes` |
| Job Notes section (engineer/customer notes list + add) | `JobNotesSection` |
| Message Office button | `MessageOfficeModal` |
| Take Payment button / receipt-number link for Completed & In Progress | `TakePaymentModal` / `receipt_number` |
| No Show and Parts Needed actions | `PrimaryActions` |
| Completed photo thumbnails | `JobPhotoThumbnails` |
| Last Service = most recent *completed* job | `useLastCompletedService` (detail instead reads the denormalised `customers.last_service_date` / `last_service_engineer`, which can disagree) |

Also noted, not part of the reported complaint: the detail screen's `TIME_LABELS` map only knows the legacy `9–11` / `11–2` / `2–5` keys, so current values like `8am–11am` pass through raw; the Reschedule dialog writes those same legacy keys.

### Smallest proposed fix (for review before building)
The genuinely "missing customer/job detail" items are display-only and cheap:

1. Add the New Customer chip and the Renewal badge to the detail header (reuse the same field checks the card uses).
2. Add the "Notes for customer receipt" block when `job.customer_facing_notes` is set.
3. Add `JobNotesSection` alongside the existing Service History / Media / Messages group.

The action-related gaps (Take Payment, No Show, Parts Needed, Message Office) are behaviour, not missing details, and touch payment/completion logic — those should be a separate scoped prompt, not folded in here.

Awaiting your call on which of those three to build.
