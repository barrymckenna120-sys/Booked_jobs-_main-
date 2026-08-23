# KN-518 parts relink + BJ-0073 / BJ-0074

## Item 1 — Data fix (the only thing to run today)

Confirmed rows (both belong to customer `6a9709c6-e533-400c-9057-93ac304ec767`, the same customer as KN-518):

| Row ID | Description | Qty | Priority | Created (UTC) | service_call_id now |
|---|---|---|---|---|---|
| `2ef4880b-d20a-47da-8957-044afc5d6bbc` | burner 2 | 2 | normal | 2026-08-23 15:44:56 | NULL |
| `32395bc7-3ddf-41a1-9381-33dccc9c4370` | parts | 1 | urgent | 2026-08-23 15:54:20 | NULL |

Target job: KN-518 = `be770207-7e87-440e-9c52-6e4dce00a4d3` (customer matches, status Completed, scheduled 2026-08-24).

Note: the 15:54 row is qty **1** in the database, not 2 — otherwise it matches your description exactly.

Exact statement (idempotent — the NULL guard means a re-run touches nothing):

```sql
UPDATE public.parts_requests
SET service_call_id = 'be770207-7e87-440e-9c52-6e4dce00a4d3',
    updated_at = now()
WHERE id IN (
  '2ef4880b-d20a-47da-8957-044afc5d6bbc',
  '32395bc7-3ddf-41a1-9381-33dccc9c4370'
)
AND service_call_id IS NULL
AND customer_id = '6a9709c6-e533-400c-9057-93ac304ec767';
```

Expected: 2 rows updated. Runs as its own isolated, review-gated write; no code changes bundled with it. I will report the real affected count and re-query both rows afterwards.

Not touched: the two older `Ordered` rows (`a4c4f5ba…` 2 burners, `d979bcb5…` burner) also have NULL `service_call_id`. Say the word if you want those looked at separately — I am not guessing at their job link.

## Item 2 — BJ-0073 (proposal only, not built today)

In `src/components/engineer/PartsNeededSheet.tsx`:

- Replace the current `jobId` initial value `""` (which silently means "no job") with a sentinel `unset` state.
- The select renders a disabled placeholder first: `Select a job…`, then the customer's recent jobs, then an explicit final option `No job (phone order)` carrying value `none`.
- `canConfirm` gains a condition: when the picked customer has one or more eligible jobs, `jobId` must not be `unset`. Confirm stays disabled with helper text `Choose a job, or "No job (phone order)"`.
- On submit, `serviceCallId` = `null` when the choice is `none`, otherwise the chosen job id. Customers with zero jobs and the manual-name path keep behaving exactly as now (no picker, `null`).
- No change to the office sheet (`NewPartsOrderSheet.tsx`) — its dropdown stays optional.

## Item 3 — BJ-0074 (lower priority, separate)

Add the read-only `PartTrackingDetails` block and `PartCommentsThread` to `src/components/jobs/PartsArrivedModal.tsx` for the parts passed in `partsRequestIds`, matching the other surfaces. Queued behind item 2.
