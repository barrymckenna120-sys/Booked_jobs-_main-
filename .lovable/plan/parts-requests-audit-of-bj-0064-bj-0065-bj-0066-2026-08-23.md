# Parts Requests — Audit of BJ-0064 / BJ-0065 / BJ-0066

Read-only audit. No code or data was changed. Three separate findings below, each with a proposed fix for approval.

---

## Finding 1 — BJ-0064: No bell notification when a parts order is created

**Confirmed. The office is never notified on creation — the notification code only runs on status changes.**

The two parts requests logged by Karl against fred test1 (KN-515's customer) are in the database:

| Created (UTC) | Part | Priority | Status | Job linked | Logged by |
|---|---|---|---|---|---|
| 23 Aug 13:23:15 | burner | urgent | Open | none | Karl |
| 23 Aug 13:26:10 | 2 burners | urgent | Open | none | Karl |

Both carry the correct organisation (K&N). Notifications created in that window: **none for either request** — the only rows around that time are job messages and a reassignment for KN-514.

Why: the notification function attached to the parts table fires **only on updates**, not on inserts. Its branches cover cancellation, "Ordered", and "Ready to Fit" — there is no "new request logged" branch at all. So nothing was attempted: no bell row, no WhatsApp, no email. This is a missing feature, not a delivery failure — recipient targeting and the realtime filter are not involved.

Also worth noting: because no job is linked (see Finding 2), a creation notification would currently read "no job linked" in its body.

**Proposed fix (needs approval):** extend the parts notification trigger to fire on insert, fanning out a `parts_requested` bell notification to the same office recipient set the cancellation branch already uses (org office/admin/owner/manager roles from engineers + profiles, plus the ops-notifications flag holder, minus the actor). Body: part description, quantity, customer, job reference, priority, logged-by name.

---

## Finding 2 — BJ-0065: "No job linked" rows

**Confirmed as real NULLs in the database, not a per-screen display bug.** Your screenshot of the engineer "My Parts" screen is the same data seen from a second consumer, which matches the audit: the label is correct on both screens because the link genuinely isn't stored.

The parts table links to a job through `service_call_id`. Of 23 rows, **16 have a job, 7 are NULL** — and all the named examples are genuinely NULL:

- fred test1 (both new rows) — NULL
- Aisling Power, Aoife Walsh, Alan Byrne, joey the slips, Paul Higgins — NULL
- KN-427 / KN-421 rows — populated, and both screens resolve them correctly

Both consumers read the same column and render the same fallback: the office Parts page uses a joined `service_calls` relation, and the engineer "My Parts" screen resolves job references in a second lookup keyed off `service_call_id`, showing "No job linked" when it is NULL. Neither screen is dropping a link that exists.

Two creation paths produce NULLs, for different reasons:

1. **Engineer's standalone Parts page** — passes `serviceCallId: null` unconditionally. The sheet lets the engineer pick a customer but offers no job picker, so a request logged there can never link to a job. This is the fred test1 case, and it is the root cause behind what your screenshot shows.
2. **Office "New Order" sheet** — has an optional job dropdown (populated from the customer's last 10 jobs); when left blank it saves NULL. Deliberate — phoned-in orders often precede the job. This is the Aisling / Aoife / Alan case (all logged by Nicole).

Paths that *do* link correctly: the engineer job card's "Parts needed" sheet and office Job Detail both pass the job id.

**Proposed fix (needs approval):** fix it at the creation layer — add a job picker to the engineer's standalone parts sheet so that after a customer is chosen it lists that customer's recent open/scheduled jobs with an explicit "No job (phone order)" option. That removes the silent drop for both consumers at once; no display change is needed on either screen. Leave the office sheet's optional behaviour as is. Existing NULL rows are historical and would stay NULL unless you want a manual tidy-up.

---

## Finding 3 — BJ-0066: Missing time on parts order date

**Confirmed. Full timestamps are stored; both screens format the time away for older rows.**

Schema: `created_at`, `ordered_at`, `ready_at`, `cancelled_at` are all full `timestamptz` — e.g. the "Ready to Fit" row for Paul Higgins holds `ordered_at = 14 Aug 07:26:53` and `ready_at = 14 Aug 07:26:54`. No precision is lost at the database level, so this is display-only on both screens.

- **Office Parts page** — its date helper formats day/month/year only, and the card renders only `created_at`; `ordered_at` / `ready_at` are never shown at all.
- **Engineer "My Parts"** — shows "Today, 2:23pm" / "Yesterday, …" for recent rows, but falls back to a plain date with no time for anything older. That is exactly why KN-427 reads as a bare date in your screenshot, while today's fred test1 rows show a time.

**Proposed fix (needs approval):** always include the time in the older-than-yesterday branch on the engineer card (e.g. "27 Jul, 1:42pm"), and apply the same relative-plus-time formatting on the office Parts page, which additionally should show the status timestamp (Ordered at / Ready at) for rows that have progressed. Europe/Dublin display throughout, shared formatter so the two screens can't drift again.


---

## Technical notes

- `notify_on_parts_request_change` is `AFTER UPDATE` only; the insert-side triggers on the table are `sync_job_status_from_parts` and `validate_parts_request_customer`, neither of which notifies.
- Insert payloads are built centrally in `src/lib/partsStatus.ts` (`buildPartsRequestRow`) via `src/lib/partsRequests.ts`, so `service_call_id` is set purely by each caller's `serviceCallId` argument — the four callers are `EngineerParts.tsx` (null), `NewPartsOrderSheet.tsx` (optional), `EngineerJobCard.tsx` (job id), `JobDetail.tsx` (job id).
- Date formatting lives in `fmtDate` in `src/pages/Parts.tsx`; the richer version is `formatCreated` in `src/components/engineer/PartRequestCard.tsx`.
- BJ-0064's fix is a database trigger change and touches the notification fan-out, so it should go through the full process rather than a lite review; BJ-0065 and BJ-0066 are contained UI changes.
