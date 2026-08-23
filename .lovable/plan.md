# BJ-0071 / BJ-0072 — Parts tracking: cost, ETA, customer-notified, quote reference, comments

Goal: staff can answer "what's ordered, what will it cost, when's it arriving, has the customer been told, which quote does it relate to" months later, from structured fields instead of free text — with a permanent comment log per part.

Informational and tracking only. Nothing here ever changes what a customer is charged.

## Decisions locked in

- Cost, ETA, customer-notified and quote reference are **office-writable only**. Engineers read them.
- Comments are open to office and engineers; edit/delete is author-scoped.
- No backfill. Historical rows keep blank new fields; only new entries get structured data.
- A revenue guard is a hard requirement on every helper that touches cost.

## Step 1 — Migration (one migration, review-gated, no data writes)

New columns on `parts_requests`:

| Column | Type | Notes |
|---|---|---|
| `quoted_cost` | numeric(10,2) null | what the supplier quoted |
| `actual_cost` | numeric(10,2) null | what it actually cost |
| `cost_currency` | text not null default `'EUR'` | future-proofing, not shown while EUR |
| `expected_delivery_date` | date null | forward-looking ETA (distinct from `ordered_at` / `ready_at` event stamps) |
| `customer_notified_at` | timestamptz null | when the customer was told |
| `customer_notified_by` | uuid null | who told them |
| `customer_notified_method` | text null | CHECK in (`whatsapp`,`phone`,`email`,`in_person`) |
| `quote_reference` | text null | BJ-0072 — typed by hand, no picker, no inference |

Cost columns get a non-negative CHECK. No CHECK involving `now()` anywhere.

New table `parts_request_comments`: `id`, `parts_request_id` (FK → `parts_requests` on delete cascade), `organisation_id` (not null), `body` (not null), `author_id`, `author_name`, `author_role`, `created_at`, `updated_at` + update trigger.

Order inside the migration is fixed: CREATE TABLE → GRANT (`SELECT, INSERT, UPDATE, DELETE` to `authenticated`, `ALL` to `service_role`, no `anon`) → ENABLE ROW LEVEL SECURITY → policies.

Comment RLS mirrors the parent, org-scoped via `get_my_org_id()`:

- read: everyone in the org (matches the parent's org-wide read)
- create: anyone in the org, must be the author
- update / delete: the author, or office roles (`admin`, `owner`, `office`, `manager`, `superadmin`) — the author-scoped analogue of the parent's "own and Open" rule, since comments have no status

Office-only enforcement for the new parent columns needs a **trigger**, not a policy. The existing engineer UPDATE policies allow any column change while `status = 'Open'`, so RLS alone would let an engineer set a cost. A `BEFORE UPDATE` trigger raises if a non-office actor changes any of the eight new columns, and leaves an automated (`auth.uid() IS NULL`) context alone so edge functions and backfills still work — the same shape as the existing billing-field protection on `organisations`.

## Step 2 — Shared logic and the revenue guard

- `src/lib/partsCost.ts`: `formatPartCost`, `costVariance` (actual − quoted, with over/under/on-budget state), `formatExpectedDelivery` (reusing the Europe/Dublin normaliser), `formatNotifiedStamp`, and `canEditPartsOfficeFields(role)`.
- `stripPartsCostFields(patch)` in the same module, mirroring `stripCallerRevenue`: any patch heading for `service_calls` gets cost keys removed, with an explicit comment that parts cost is supplier cost and must never reach `revenue`, `balance_due` or quote/invoice totals.
- `updatePartStatus` in `src/lib/partsRequests.ts` gains no cost awareness; a separate `updatePartsOfficeFields(id, patch)` handles the office-only fields and runs the strip guard.
- Unit tests for variance maths, currency formatting, the strip guard, and the role check.

## Step 3 — UI rollout

Two shared presentational pieces, so nothing is duplicated eight times:

- `PartCostSummary` — quoted vs actual with the variance chip.
- `PartTrackingRow` — ETA, notified stamp, quote reference as compact labelled values, self-hiding when empty.

Read surfaces (all get `PartCostSummary` + `PartTrackingRow`; empty fields render nothing so historical rows look unchanged):

1. `src/pages/Parts.tsx` — office list, plus inline office editing and a comment thread per part
2. `src/components/dashboard/PartsPanel.tsx` — ETA and notified state only, kept compact
3. `src/pages/JobDetail.tsx` — persistent Parts section (Active + History)
4. `src/components/parts/CustomerPartsHistory.tsx` — customer record
5. `src/components/engineer/PartRequestCard.tsx` — read-only, no edit controls
6. `src/pages/engineer/EngineerParts.tsx` — inherits via the card, comments readable and postable
7. `src/components/engineer/EngineerJobCard.tsx` — ETA only where a part is outstanding
8. `src/pages/engineer/EngineerToday.tsx` — indicator only, no new detail

Create forms:

9. `src/components/parts/NewPartsOrderSheet.tsx` (office) — optional quoted cost, ETA, quote reference at creation
10. `src/components/engineer/PartsNeededSheet.tsx` (engineer) — unchanged fields; office-only inputs are simply absent

Comments UI: one `PartCommentsThread` component used by the office list, Job Detail, customer history and the engineer card — newest-last, author name and timestamp, author-only edit/delete, realtime on the existing `parts_requests` channel pattern.

Marking notified: the existing "Tell customer parts arrived" flow (`PartsArrivedModal`) currently sends a WhatsApp and records nothing on the part. It will stamp `customer_notified_at` / `_by` / `_method = 'whatsapp'` on the affected parts on success, plus a manual "Mark customer notified" control for phone or in-person contact.

## Step 4 — Verification

- Unit tests for cost, variance, guard, role gating.
- Playwright, office session: create with cost/ETA/quote ref, edit, post a comment, confirm the notified stamp lands from the parts-arrived flow.
- Playwright, engineer session: confirm the new fields are visible and read-only, no cost inputs render, comments post.
- SQL check that a non-office actor updating a cost column is rejected by the trigger, and that a status-only engineer update on an Open row still succeeds.
- Confirm no parts function or client path references `revenue`, `balance_due`, quotes or invoice totals after the change.
- Any scratch data used gets deleted.

## Sequencing

The migration is its own review-gated step with no data writes. Code lands after it is applied and types regenerate. No backfill step exists.
