# BJ-0068 — Engineer "My Parts" doesn't pick up office-created orders

## Audit findings (read-only, no writes made)

### 1. The database row is correct

Parts request for KN-515:

- id `2577465e-8a5b-4668-b0a5-ecd55b98ad8e`
- description "new swith", quantity 1, priority normal, status Open
- `service_call_id` = `11c5d413-cfbc-449d-b43b-5b2abc24ac28` — **populated**, and that is job KN-515 (org `8c37827f…`, currently En Route)
- `customer_id` = `6a9709c6…`
- `assigned_to` = `55b9ba7b…` = engineer Karl (auth user `57ebf8de…`)
- `logged_by` = Nicole; `engineer_id` / `assigned_engineer_id` are NULL (expected for an office-created order)
- `created_at` = `updated_at` = 2026-08-23 13:41:31 UTC — the job was linked at creation, not added later

So this is not a missing-link or late-link case.

### 2. The lookup logic is also correct

`src/pages/engineer/EngineerParts.tsx`

- lines 71-81: rows are matched with `.or(engineer_id.eq.<uid>, assigned_engineer_id.eq.<uid>, assigned_to.eq.<engineers.id>)` — the third branch matches this row, so it does belong in Karl's list
- lines 93-108: second lookup — `service_calls.select("id, job_reference").in("id", jobIds)` keyed on `service_call_id`, stored in `jobRefs`
- line 178: `jobReference={row.service_call_id ? jobRefs[row.service_call_id] ?? null : null}`
- `src/components/engineer/PartRequestCard.tsx` lines 76-86: shows the reference, or "View job" if the ref is missing, or "No job linked" when `service_call_id` is NULL

Access is not the blocker either: `parts_requests_select` and `service_calls_select` are both plain `organisation_id = get_my_org_id()`, so Karl can read both the request and the job reference.

### 3. Root cause: no refetch / no realtime

The load effect (`EngineerParts.tsx` line 53) depends only on `[user?.id, reloadKey]`, and `reloadKey` is bumped only by the engineer's own actions (logging a part, cancelling one). A repo-wide search finds **no realtime channel on `parts_requests` anywhere** — not on the engineer screen, not on the office Parts page, Dashboard, or JobDetail.

The engineer app is an installed PWA that stays mounted for hours, so an order the office creates after the screen last loaded is simply never fetched. The symptom matches: the request (and therefore its job number) is absent/stale until Karl force-reloads the app.

Conclusion: **refresh/realtime gap, not a resolution bug.** The data resolves correctly on a fresh load.

## Proposed fix (for approval — nothing changed yet)

1. Subscribe `EngineerParts.tsx` to `postgres_changes` on `public.parts_requests` filtered by `organisation_id`, bumping `reloadKey` on INSERT/UPDATE/DELETE, matching the existing `useEngineerJobs` realtime pattern.
2. Refetch when the PWA returns to the foreground — a `visibilitychange` listener bumping `reloadKey` — so a backgrounded app is current the moment it's reopened.
3. Do the same on the office `Parts.tsx` list so engineer-logged requests appear there without a manual reload.
4. Leave the row-matching and job-reference lookups untouched; they are already correct.

### Verification

- Live check with two sessions: leave the engineer My Parts screen open, create an office order for a scratch job, confirm the card and its job reference appear without reloading.
- Background/foreground the engineer app and confirm the list refreshes.
- Clean up any scratch rows afterwards.
