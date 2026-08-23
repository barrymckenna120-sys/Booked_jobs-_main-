# BJ-0069 / BJ-0070 — Parts history on customer + job records (revised)

Item #1 is dropped. No new "Fitted" status, no `fitted_at` / `fitted_by` columns, no auto-mark-on-completion trigger, and no changes to `sync_job_status_from_parts` or `recompute_job_parts_status`.

Parts keep exactly their current statuses: **Open / Ordered / Ready to Fit / Cancelled**.

## What ships

1. **Customer Parts section** — on the customer record, a "Parts" card listing every parts request ever raised for that customer (direct read, no aggregation table), each with its status trail: Logged → Ordered → Ready to fit, plus Cancelled where it applies, with date + time on each step.
2. **Activity timeline entries** — parts lifecycle events appear in the customer activity timeline: part logged, part ordered, part ready to fit, part cancelled. No "fitted" event, since that status doesn't exist.
3. **Job Detail persistent Parts section** — parts never disappear from a job. Active parts (Open / Ordered / Ready to Fit) sit in the working area; Cancelled parts move into a timestamped "History" group that stays on the job permanently.
4. **Backfill** — historical parts requests get their timeline entries, run once and safe to re-run.

## Backfill query (for review before running)

Idempotent: each candidate row is guarded by a `NOT EXISTS` check on the same customer + part + event type, so a second run inserts nothing.

```sql
-- one INSERT per lifecycle stamp that exists on the row
INSERT INTO public.customer_activity
  (organisation_id, customer_id, service_call_id, event_type, description, event_data, created_at)
SELECT c.organisation_id, c.id, pr.service_call_id, e.event_type, e.description,
       jsonb_build_object('parts_request_id', pr.id, 'description', pr.description,
                          'quantity', pr.quantity, 'priority', pr.priority, 'backfilled', true),
       e.stamp
FROM public.parts_requests pr
JOIN public.customers c
  ON c.id = COALESCE(pr.customer_id, (SELECT customer_id FROM public.service_calls s WHERE s.id = pr.service_call_id))
CROSS JOIN LATERAL (VALUES
  ('part_logged',    'Part logged',       pr.created_at),
  ('part_ordered',   'Part ordered',      pr.ordered_at),
  ('part_ready',     'Part ready to fit', pr.ready_at),
  ('part_cancelled', 'Part cancelled',    pr.cancelled_at)
) AS e(event_type, description, stamp)
WHERE e.stamp IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_activity ca
    WHERE ca.customer_id = c.id
      AND ca.event_type = e.event_type
      AND ca.event_data->>'parts_request_id' = pr.id::text
  );
```

### Before / after row counts

Current `customer_activity` parts rows (already present from the earlier run of this backfill):

```text
part_logged     24
part_ordered    14
part_ready       8
part_cancelled   8
total           54
```

`parts_requests` today: Open 6, Ordered 2, Ready to Fit 8, Cancelled 8 (24 rows total).

Because the guarded backfill has already been applied for these 24 parts, the expected result of running it again is **54 → 54, 0 rows inserted** — which is exactly the idempotency check. It will be run and the counts reported back before and after, so nothing is assumed.

## Technical notes

- `log_parts_request_activity()` trigger (already in place) fires on INSERT and on real status transitions only (`NEW.status IS NOT DISTINCT FROM OLD.status` → no-op). Branches: `part_logged`, `part_ordered`, `part_ready`, `part_cancelled`. No fitted branch. Customer resolved from `parts_requests.customer_id`, falling back to the linked job's customer; rows with no resolvable customer are skipped.
- `PART_STATUSES` = `["Open", "Ordered", "Ready to Fit", "Cancelled"]` in `src/lib/partsStatus.ts`; `buildPartStatusTrail` emits `logged / ordered / ready / cancelled` steps only.
- Shared UI: `src/components/parts/PartStatusTrail.tsx` (per-part trail) and `src/components/parts/CustomerPartsHistory.tsx` (customer card), reused by `CustomerDetail.tsx`.
- `CustomerActivityTimeline.tsx` renders parts `event_data` detail (quantity, priority, notes) with pills for the four parts event types.
- `JobDetail.tsx` splits parts into active vs. history with `formatPartStatusStamp` from `src/lib/partsDates.ts` for date + time display.
- No schema change, no constraint change, no new trigger on `service_calls`.
