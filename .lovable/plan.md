# Engineer parts cancel + resolve the cancelling user's name

Two defects found while tracing the failed cancel of the seeded test row. Both are frontend/write-path fixes — no schema change, no RLS change, no trigger change.

## What the trace established

- Test row `81fde281-…` is still `Open`. `updated_at` equals `created_at` exactly and `ordered_at` / `ready_at` / `cancelled_at` are all NULL: no UPDATE has ever touched it. The Open → Ordered → Ready to Fit walkthrough happened on a different row (`4a73d3e4-…`, KN-447).
- `src/components/engineer/PartRequestCard.tsx` is presentation only — no buttons, no Supabase import, no update call. Searching the whole engineer surface for parts cancellation returns only *job* cancellation. So no request was ever sent; there is no 403 and no failed PATCH to show.
- The database already grants the action: `parts_requests_update_own_open_engineer_id` allows an engineer to move their own `Open` row to `Cancelled` (`USING status = 'Open'`, `WITH CHECK status IN ('Open','Cancelled')`). The grant exists; the control to use it does not.
- The "cancelled by Unknown user" wording is not a trigger bug. The trigger resolves the name from `NEW.cancelled_by` via `profiles.display_name`, then `engineers.name`. `updatePartStatus` in `src/lib/partsRequests.ts` stamps only `cancelled_at`, so `cancelled_by` stays NULL and the lookup falls through to the literal `'Unknown user'`.

## Change 1 — Cancel action on the engineer's own Open parts requests

Add a cancel control to `PartRequestCard`, shown **only** when the row's status is `Open` and the signed-in user is the row's engineer (`engineer_id` or `assigned_engineer_id` matches their auth id). On any other status the control is absent — a button is never offered that RLS would reject.

Flow: tap Cancel, confirm in a small sheet consistent with the existing engineer sheets, then the row is set to `Cancelled`. On success the card updates in place and a toast confirms it; on failure the card stays as it was and the error surfaces in the toast rather than failing silently.

The office fan-out then fires from the existing trigger with no change to it, so the office bell gets **Part Request Cancelled** for an engineer-initiated cancel — the path that has never actually been exercised.

## Change 2 — Stamp who cancelled

`updatePartStatus` sets `cancelled_by` to the acting user's auth id alongside `cancelled_at`, so the trigger resolves a real display name. This corrects the wording for every future cancellation from both the office screen and the new engineer control.

Existing notification rows keep their `'Unknown user'` text; they are historical records and are not rewritten.

## Technical notes

- `src/components/engineer/PartRequestCard.tsx` — gains an ownership + status check and the cancel control. Card takes the confirm/submit handling; the list page passes down a refresh callback.
- `src/pages/engineer/EngineerParts.tsx` — refreshes its rows after a successful cancel so the status pill flips to `Cancelled` immediately.
- `src/lib/partsRequests.ts` — `updatePartStatus` adds `cancelled_by` on the `Cancelled` branch. This is the single wrapper both surfaces already call.
- `src/lib/partsStatus.ts` — add a small pure predicate (`canEngineerCancelPart`) so the visibility rule is unit-testable and mirrors the RLS clause exactly.

## Tests

- Unit tests for `canEngineerCancelPart`: own Open row true; own Ordered / Ready to Fit / Cancelled row false; another engineer's Open row false.
- Unit test that `updatePartStatus('Cancelled', …)` includes both `cancelled_by` and `cancelled_at`, and that the other three statuses do not set `cancelled_by`.
- Live verification on the seeded row `81fde281-…` (`TEST — thermostat`, KN-463, Karl): cancel it as Karl, then paste the actual row (`status`, `cancelled_at`, `cancelled_by`) and the resulting `parts_cancelled` notification rows showing the body reads "cancelled by Karl" rather than "Unknown user".
- Negative live check: confirm the control is absent on a non-Open row.

## Risk

Touches the parts write path and an engineer-facing control, so it gets the full test pass above rather than a lite review. No migration, no policy edit, no trigger edit.
