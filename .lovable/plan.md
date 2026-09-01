# BJ-0090 Pre-Build Audit — Multi-Engineer Job Assignment

Audit only. No code, SQL, or config was changed. All DB findings are from live reads of the production database, not migration files.

## Correction to the feature model (read before building)

`service_calls.engineer_id` **does not exist**. The Lead engineer is stored as two columns:

- `assigned_engineer_id` (uuid, nullable, FK to `engineers(id)`, **no ON DELETE rule**)
- `assigned_engineer` (text, nullable) — denormalised engineer **name**, written alongside the id everywhere

Every write path, query, RLS policy, and the notification trigger use `assigned_engineer_id`. The BJ-0090 spec should be restated against these two columns, and any assist work must keep the denormalised name pair in sync.

## A. New Job wizard assignment path

`src/components/jobs/NewJobPanel.tsx` → `StepSchedule` (`:799`, rendered at `:1900`) → `handleNext` (`:928-936`) → `handleSubmit` (`:1555`) → direct `supabase.from("service_calls").insert(...)` (`:1635-1670`).

- Selection UI: hand-rolled list of `<button>` cards, one per active engineer (`:1028-1063`); header "Assign Engineer" (`:1026`).
- State: `const [engineer, setEngineer] = useState(...)` (`:806`) — scalar string id, overwritten on click (`:1036`). Strictly single-select today.
- Validation: engineer required — `if (!engineer) e.engineer = true` (`:932`). Cards disabled when slot full (load >= 3) or engineer on leave (`:1038-1040`, `:819-832`, `:857-871`).
- Writes: `assigned_engineer_id` (`:1649`) and `assigned_engineer: eng?.name` (`:1650`).
- Side effect: `send-push-notification` Edge Function after insert (`:1707-1730`); in-app row left to the DB trigger.
- No RPC, no Edge Function, no helper wraps the insert.

## B. Assign / Move Job path

`src/components/schedule/UnallocatedJobs.tsx` (`:181-184` "Assign" → `onAssign` callback) and `src/components/schedule/AssignJobModal.tsx` (title "Assign / Move Job", `:130-137`) → `handleAssign` in `src/pages/Schedule.tsx:326-499` → direct `supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({...})).eq("id", jobId)` (`:350-360`).

- Dropdown: shadcn `Select` (`AssignJobModal.tsx:229-242`). State `selectedEngineer` (`:55`) holds the engineer **name**, not the id (`:94`, `:231`).
- Assign and move share **one handler** — `openAssignFromUnallocated` (`Schedule.tsx:516-518`) and `handleMoveSlot` (`:507-510`) both open the same modal instance (`:624-634`); no new-vs-existing branching except for notification targeting.
- Writes: `scheduled_date`, `time_block`, `assigned_engineer` (`:355`), `assigned_engineer_id` (`:356`), `status: "Booked"` (forced on every assign/move), `needs_scheduling: false`.
- Side effects: audit log `job_assigned` (`:365`); `send-booking-confirmation` WhatsApp EF (`:369-380`); `send-push-notification` EF plus a **direct frontend insert into `notifications`** (`:432-445`) computed from `engineerChanged`/`scheduleChanged` (`:390-416`).
- `sanitizeServiceCallUpdatePayload` (`src/lib/serviceCallUpdate.ts:53`) only strips 22 UI-only keys; no engineer field is touched.

## C. Engineer "My Jobs" query

`src/hooks/useEngineerJobs.ts` → `useEngineerJobs()` (`:52`). Three direct `.from("service_calls").select("*")` queries (`:164-177`) in one `Promise.all` (`:179-183`). No RPC or Edge Function.

- Engineer id resolved from `engineers` by `auth_user_id` (`:128-132`); filter `.eq("assigned_engineer_id", engineerId)` applied only `if (engineerId)` (`:173-176`) — the "NOT FILTERED" fallback at `:159-161` is a real code path.
- Limits: upcoming `.limit(20)`, completed `.limit(30)` (`:170-171`).
- Realtime: channel `engineer-jobs-realtime` subscribes to `service_calls` with **no filter** (`:743-750`), relying entirely on RLS; second channel on `notifications` filtered by recipient (`:753-767`).
- Assist-extension risks: no dedupe by `job.id` anywhere (lead + assist union would render duplicate cards); the hardcoded limits break if two result sets are merged client-side; `completedJobs` is never re-sorted after fetch so a concat violates `updated_at desc`; the `localStorage` cache key `bookedjobs_engineer_jobs_cache` (`:113`) is per-device, not per-engineer, so it needs a version bump.

## D. Engineer job-card action architecture

Actions are **not** in one shared component — two surfaces have already drifted apart.

- List card: `src/components/engineer/EngineerJobCard.tsx`, composing `job-card/PrimaryActions.tsx`, `SecondaryActions.tsx`, `QuickActions.tsx`, `InfoPills.tsx`, `StatusBadge.tsx` (imports `:24-28`, usage `:214-339`). "Last Service … Engineer: {name}" at `:241-251`. En Route at `PrimaryActions.tsx:16-21`. Complete at `PrimaryActions.tsx:40-48`/`:96-104`. Take Payment banner at `EngineerJobCard.tsx:351-383`. Message Office at `:328-339`. "Can't complete this job?" at `PrimaryActions.tsx:49-87`.
- Detail page: `src/pages/engineer/EngineerJobDetail.tsx` imports **none** of the `job-card/*` action components and re-implements actions inline (`:1100-1199`, sheets `:1205-1220`). It has no En Route step, no Message Office, no "Can't complete", and no Take Payment banner.
- Safest Assist gating: one `isLeadEngineer` prop threaded from the list/page level, applied at the four existing `{!isDone && …}` blocks in `EngineerJobCard.tsx` (`:302-313`, `:315-326`, `:329-339`, `:352-383`) and the already-conditioned blocks in `EngineerJobDetail.tsx` (`:1100-1112`, `:1115-1199`). Read-only sections (info tiles, history, notes, media, messages) stay ungated.

## E. Job Detail drawer (office)

`src/components/schedule/JobSlotDrawer.tsx` → `JobSlotDrawer` (`:24-307`, Sheet at `:75`), opened from `src/pages/Schedule.tsx:637-641`.

- Engineer shown at `:169-175` as `{job.assigned_engineer || "—"}`; also gates the WhatsApp button at `:272`.
- Source: the denormalised `assigned_engineer` text off the row — no `engineers` join or lookup map in the drawer.
- It receives a **curated `ScheduleJob` subset**, not the full `service_call` row (shape at `Schedule.tsx:81-123`, mapping `:180-243`), and makes its own extra query for `whatsapp_confirmation_sent` (`:30-33`). Assist fields would have to be added to that shape explicitly.

## F. Schedule grid

`src/pages/Schedule.tsx` → `Schedule` (`:125`) → `src/components/schedule/WeeklyGrid.tsx` → `WeeklyGrid` (`:58-301`).

- No extracted card component — markup is inline: desktop `:146-208`, mobile `:242-270`, empty-slot "+ Assign" `:212-217`/`:273-278`.
- Lead engineer is a **plain muted text label**, shown only when the filter is "all engineers" (desktop `:202-207`, mobile `:264-269`). Grid is time-block rows x day columns, not a column per engineer. No avatar, initials, or colour coding.
- Engineer data already present: `["engineers"]` query selects `id, name` (`Schedule.tsx:144-151`); job engineer comes from the denormalised columns (`:217-218`). `WeeklyGrid` separately queries `id, auth_user_id` (`:63-76`).
- Best indicator slot with zero layout change: the existing badge flex row (desktop `WeeklyGrid.tsx:196-201`, mobile `:256-262`), or appended after the engineer name at `:204`/`:266`.
- Screenshot captured: the current week renders with no jobs booked, so the grid shows only "+ Assign" cells and "No unallocated jobs" — there was no job card or drawer to capture.

## G. Notification path

`notify_on_job_change()` — live definition read from the database (226 lines). Repo copies exist in several migrations, latest `supabase/migrations/20260827145257_bee02f9a-98de-41f9-bec8-ebc01f97909f.sql`.

- Trigger: `trg_notify_on_job_change`, `AFTER INSERT OR UPDATE ON public.service_calls FOR EACH ROW`. Other triggers on the table: `set_job_reference`, `trg_log_job_booked_activity`, `trg_log_job_completed_activity`, `trg_sync_invoice_status_from_job`, `update_service_calls_updated_at`.
- Recipient resolution: single `SELECT auth_user_id, name, status FROM engineers WHERE id = NEW.assigned_engineer_id LIMIT 1` (function lines 50-51, 68-69, 106, 140-141, 191) — sends only when `status = 'active'`. Office recipients come from `job_alert_recipients(organisation_id)`.
- Assignment on insert: lines 49-61. Reassignment: lines 65-101 — notifies the new engineer ("Job Reassigned"), and all office users, when `assigned_engineer_id` changes. Status/completion/cancel/no-show/parts paths: lines 103-221.
- The function assumes **exactly one** engineer per job throughout — every branch reads the single scalar column. It will never notify an assist engineer, and reassigning the Lead will not touch assist rows.
- Note the duplication risk already present: `Schedule.tsx` also inserts `notifications` rows directly for assign/move (`:437-445`) while this trigger fires on the same UPDATE.

## H. RLS / permission findings (live DB)

`service_calls` policies, all `PERMISSIVE` for `authenticated`:

| Policy | Cmd | Expression |
|---|---|---|
| `service_calls_select` | SELECT | `organisation_id = get_my_org_id()` |
| `service_calls_update` | UPDATE | using + check `organisation_id = get_my_org_id()` |
| `service_calls_insert` | INSERT | check `organisation_id = get_my_org_id()` |
| `service_calls_delete` | DELETE | `organisation_id = get_my_org_id()` |
| `service_calls_org_isolation` | ALL | `organisation_id = get_my_org_id()` |

- Engineers can currently **SELECT and UPDATE every job in their organisation**, including other engineers' jobs. Access is **not** based on `assigned_engineer_id` at the database level; Lead-only behaviour is enforced in the UI only.
- Consequence for BJ-0090: assist engineers would already have full edit rights on the job row the moment they can see it. Visibility-only is a UI promise, not a DB guarantee.
- The broad `service_calls_org_isolation` ALL policy is exactly the "broad organisation-level policy" the brief asked about — it alone grants engineers write access regardless of any narrower policy added later (permissive policies OR together).
- **Migration/DB divergence:** the newest repo definition of `service_calls_select` (`supabase/migrations/20260423152056_...sql:20-34`) is role-scoped — `WHEN 'engineer' THEN assigned_engineer_id = get_engineer_id(auth.uid())`. The live policy is org-only, and no migration in the repo produces it. `20260819165508_...sql:62-71` added the org-isolation/insert policies. Migration history is not a reliable description of live access rules.
- `job_media` and `job_messages` are likewise org-only (SELECT/UPDATE/INSERT/DELETE), so assist engineers get media and messages for free.
- `engineers` SELECT is org-wide; UPDATE is role-gated to admin/owner/office/manager/superadmin or self.

## I. Existing assignment-schema conflicts

None. A repo-wide search for `job_engineers`, `crew`, `assist_engineer`, `collaborator`, `technician_assign`, `secondary_engineer` across `src/` and `supabase/` returned **zero matches**, and no such table exists in the live schema. Related but non-conflicting: `engineers`, `engineer_blocks` and `engineer_working_days` (both `engineer_id` FK `ON DELETE CASCADE`), `parts_requests.assigned_to` (FK to `engineers`, no delete rule). Introducing `job_engineers` duplicates nothing.

## J. Recommended constraints for `job_engineers`

Recommendation only — no migration proposed here.

- `job_id uuid NOT NULL REFERENCES service_calls(id) ON DELETE CASCADE` — matches the existing child-table convention (`job_media`, `job_messages`, `service_call_tags`, `quotes.job_id`, `cert2_certificates`).
- `engineer_id uuid NOT NULL REFERENCES engineers(id) ON DELETE CASCADE` — matches `engineer_blocks`/`engineer_working_days`; an assist row has no value once the engineer is gone. Use `RESTRICT` instead only if assist history must survive engineer deletion.
- `organisation_id uuid NOT NULL` with the org default, plus GRANTs and RLS in the same migration.
- `UNIQUE (job_id, engineer_id)` to stop double-adding.
- A check or trigger enforcing max 2 assist rows per job, and rejecting `engineer_id = service_calls.assigned_engineer_id` so the Lead can't also be an assist.
- Indexes on `(engineer_id)` and `(job_id)` for the My Jobs query.
- Current delete behaviour on `service_calls` is mixed and worth knowing: CASCADE for `job_media`, `job_messages`, `service_call_tags`, `quotes.job_id`, `cert2_certificates`; SET NULL for `notifications`, `hazard_notifications`, `customer_call_notes`, `parts_requests`, `matched_job_id`; **RESTRICT** for `job_payments`; and **no rule at all** for `certificates`, `invoices`, `customer_activity`, `transactions`, `payment_checkout_attempts`, `sumup_webhook_events`, `quotes.converted_job_id`.

## K. Risks before implementation

1. RLS gives every org engineer full UPDATE on every job — "visibility-only" assist cannot be enforced without a narrower policy, and the existing `service_calls_org_isolation` ALL policy would override any narrower one added alongside it.
2. Live RLS does not match migration history; changing policies for BJ-0090 needs the live state as the baseline.
3. The spec's `service_calls.engineer_id` does not exist; the Lead is `assigned_engineer_id` plus the denormalised `assigned_engineer` name that every write path keeps in sync.
4. `notify_on_job_change()` assumes one engineer in every branch and will not notify assists; `Schedule.tsx` also inserts notifications directly for the same UPDATE, so assist notifications must pick one path or double-fire.
5. Engineer actions are duplicated across `EngineerJobCard` + `job-card/*` and `EngineerJobDetail`, which have already drifted (no En Route, Message Office, or "Can't complete" on the detail page) — an Assist mode must gate both surfaces or assists will keep Lead actions on one of them.
6. `useEngineerJobs` has no dedupe, hardcoded limits, an unsorted completed list, and a device-scoped localStorage cache — all need attention before assist jobs are unioned in.
7. Unrelated bug for the register only, not touched: `useEngineerJobs.ts:159-161` silently drops the engineer filter when the engineer lookup fails, and the same file's cache is shared across engineers on a shared device.

## AUDIT VERDICT

**CLEAR TO BUILD WITH RISKS**

- Nothing blocks the build: no conflicting schema exists, and the Lead write paths are few, direct, and easy to leave untouched.
- The feature spec must first be corrected to `assigned_engineer_id` + `assigned_engineer`.
- Assist "visibility-only" needs an explicit RLS decision, because engineers today can update every job in their org.
- Assist notifications need a decision between the DB trigger and the existing frontend inserts.
- The two engineer UI surfaces must both be gated, and `useEngineerJobs` hardened for dedupe/limits, before assist jobs are surfaced.
