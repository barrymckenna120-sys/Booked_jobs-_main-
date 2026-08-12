# Office "Parts Needed" on Job Detail: stop writing notes, write a parts_requests row

## 1. The exact code running today

`src/pages/JobDetail.tsx` lines 970-983:

```tsx
<PartsNeededSheet
  open={partsNeededOpen}
  onClose={() => setPartsNeededOpen(false)}
  loading={actionLoading}
  onConfirm={async (notes) => {
    setActionLoading(true);
    await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({
      status: "parts_needed",
      notes: notes ? `Parts Needed: ${notes}` : "Parts Needed",
    } as any)).eq("id", job.id);
    logAudit({ action_type: "job_parts_needed", ..., metadata: { notes } });
    ...
  }}
/>
```

No `parts_requests` insert anywhere on this path.

## 2. Yes — this is the old pre-migration path

It still writes the note string and sets `status: 'parts_needed'` directly, exactly as before the `parts_requests` migration. `EngineerJobCard.tsx` (line 287-313) was migrated and now calls `insertPartsRequest({ part, organisationId, serviceCallId, customerId, loggedBy, loggedByName, assignedTo })`.

Why this one was missed: the migration work was scoped and verified through the engineer surface (`EngineerJobCard` → `/engineer/parts` → `/parts`). `JobDetail.tsx` shares only the *sheet component*, not the write path — its handler is an inline `supabase.update` sitting in a block of five near-identical inline handlers (No Show, Cancel, Note, Parts, Payment). Searching for the write path by helper name never surfaced it because it never imported the helper.

## 3. Where the `[object Object]` comes from

`PartsNeededSheet` was changed during the migration to emit a **structured part object**:

```ts
onConfirm: (part: PartLineInput) => void   // { description, priority, quantity }
```

`JobDetail.tsx` still types its callback parameter as `notes` and interpolates it into a template string: `` `Parts Needed: ${notes}` ``. Interpolating the object yields the literal `Parts Needed: [object Object]`. The mismatch is exactly one line: the sheet's new object contract meeting the old string interpolation in `JobDetail.tsx` line 976. The `as any` cast on the payload is why TypeScript never flagged it.

## 4. Production corruption check — clean, nothing to repair

```
select count(*) filter (where notes ilike '%object Object%') from service_calls;
-> 0
```

Zero rows contain `[object Object]`. The 11 rows with `Parts Needed…` notes are legitimate old-format text from before the migration (e.g. `KN-132 "Parts Needed [Urgent]: burner"`, `DG-402 "Parts Needed [Urgent]: new burner"`), and 9 of the 11 already have a matching `parts_requests` row from the backfill. So no notes have been overwritten in production yet, and no repair is proposed. Two rows (`KN-324`, `KN-037`) have a parts note but no parts row — both are Cancelled/Completed, out of the active pool; leaving them as-is.

Data loss so far is limited to office-logged requests being absent from `parts_requests` (nothing was inserted), not destroyed note text.

## 5. The fix

In `src/pages/JobDetail.tsx`, replace the `onConfirm` body with an `insertPartsRequest` call and delete the `service_calls` update entirely for this action:

- `part` — the object from the sheet (description, priority, quantity)
- `organisationId` — `(job as any).organisation_id` (already read on this page, line 441)
- `serviceCallId` — `job.id`
- `customerId` — `job.customer_id`
- `loggedBy` — `user.id` from `useAuth()` (already in scope, line 290)
- `loggedByName` — resolved office display name
- `assignedTo` — the job's `assigned_engineer_id` (so the request is aimed at whoever is on the job), `null` when unassigned

No `status` write and no `notes` write: `recompute_job_parts_status()` sets `service_calls.status` to `parts_needed` from the inserted row. `logAudit` stays, with the metadata switched to the part fields.

### One decision that needs your call

You specified `engineer_id = null` for office-logged rows. Today `buildPartsRequestRow` hardcodes `engineer_id: loggedBy`, and the notification trigger reads `engineer_id` / `assigned_engineer_id` to decide who to notify back when office changes a request. Setting it to the office user's id would make office notify itself; setting it to `null` means the assigned engineer hears nothing about a part logged for them.

Proposed: add an optional `engineerId` argument to `buildPartsRequestRow` (defaulting to the current `loggedBy` behaviour so the engineer path is untouched), and have the office path pass the **assigned engineer's** id — `null` when the job has no engineer. That keeps the fan-out useful without changing engineer behaviour. Say the word if you'd rather it be strictly `null`.

## 6. Verification

- Unit test for the office row shape (`logged_by` = office user, `engineer_id` per the decision above, `status: 'Open'`, description/priority/quantity carried through) in `src/lib/partsStatus.test.ts`.
- Live: log a part as office on a real test job, then paste actual output of a `parts_requests` select for that job plus a `select notes from service_calls` showing the note untouched, and confirm the row on `/parts` and in the dashboard Parts panel.

## Technical notes

- `PartsNeededNoteBlock` on this page renders only when `job.notes` starts with `"Parts Needed"`. Since notes are no longer written, new requests display through `PartsNeededSection` (status-driven, already on the page) — no change needed there, and the legacy block stays for the 11 historical rows.
- `parts_priority` / `parts_logged_at`: the engineer path still stamps these for the Jobs/Schedule chips. The office path will stamp them the same way for consistency, in a separate small update that touches only those two columns — never `notes`, never `status`.
