# BJ-0090c-audit — Can `service_calls_update` be narrowed to the assigned engineer?

Read-only audit. No code, SQL, or policies were changed. All database facts below are read live from `pg_policies` / `pg_proc` / `cron.job`, not from migration files.

**Headline:** nothing in the application relies on an engineer updating a job that is not theirs. Every engineer-reachable write goes through `.eq("id", …)` and leans on RLS alone, and every backend writer uses the service-role key, which bypasses RLS entirely. Narrowing is safe today, with two conditions the new policy must handle: the `can_access_office` engineer escalation path, and the fact that `get_user_role()` reads `engineers.role` first.

## 1. Every UPDATE path on `service_calls`, and what constrains the row

### Frontend — user JWT (anon key + session), RLS is the only guard

All sites use the shared client at `src/integrations/supabase/client.ts:12`. **None** of them adds `assigned_engineer_id` to the query. There are no `.upsert()` calls on `service_calls` anywhere in the repo.

Engineer-reachable (these are the ones a narrower policy would affect):

| File:line | Columns written | Row scope |
|---|---|---|
| `src/hooks/useEngineerJobs.ts:387` | dynamic `safeDbPatch` (status, payment, tags) | `.eq("id", jobId)` only |
| `src/pages/engineer/EngineerJobDetail.tsx:371` | dynamic `safeDbPatch` | `.eq("id", job.id)` only |
| `src/pages/engineer/EngineerJobDetail.tsx:628` | `invoice_number` | `.eq("id", job.id)` only |
| `src/pages/engineer/EngineerJobDetail.tsx:663-666` | `scheduled_date`, `time_block`, `status` | `.eq("id", job.id)` only |
| `src/components/engineer/ExtraWorkSheet.tsx:136-138` | payment/revenue patch via `buildPaymentPatch` | `.eq("id", job.id)` only |
| `src/components/payments/TakePaymentModal.tsx:154` and `:280-283` | payment + `invoice_number`, `status`, `completed_at` | `.eq("id", job.id)` only |

```ts
// src/hooks/useEngineerJobs.ts:387
const { error } = await supabase.from("service_calls").update(safeDbPatch).eq("id", jobId);
```

`TakePaymentModal` is shared: mounted from `src/components/engineer/EngineerJobCard.tsx:422` and `src/components/engineer/EngineerOutstandingBalances.tsx:212` (engineer), and from `src/pages/JobDetail.tsx:1178` / `src/pages/Jobs.tsx:797` (office).

Office/admin-only (not imported by anything under `src/pages/engineer/**` or `src/components/engineer/**`), all `.eq("id", …)` only:

- `src/pages/Schedule.tsx:350-359` (assign/move — writes `assigned_engineer_id`, `assigned_engineer`, `scheduled_date`, `time_block`, `status`, `needs_scheduling`), `:475`, `:487-489`, `:522-526`
- `src/pages/JobDetail.tsx:499-503`, `:522-527`, `:539-543`, `:569-573` (reassign engineer), `:965`, `:1108`, `:1160-1163`
- `src/pages/IncomingJobs.tsx:151-154`; `src/components/incoming/JobReviewPanel.tsx:117-127` and `:178-181`
- `src/components/jobs/ScheduleIncomingJobModal.tsx:97-105`, `src/components/jobs/PartsArrivedModal.tsx:74-78`, `src/components/jobs/QuotePanel.tsx:136`
- `src/components/dashboard/FollowUpsPanel.tsx:64-68`, `src/components/whatsapp/LogReplyModal.tsx:65-68`, `src/pages/InvoicePreview.tsx:165-168`
- `src/pages/CustomerDetail.tsx:384-389` — the one exception to id-scoping: a **bulk multi-row** update of `boiler_brand` scoped by `.eq("customer_id", id)`. Office-only, but a role-branched policy has to still permit it for office/admin.

`src/lib/serviceCallUpdate.ts` (`sanitizeServiceCallUpdatePayload`) is a pure payload sanitiser used by most sites — it adds no row filter.

### Edge Functions — service-role key, RLS bypassed, unaffected by any policy change

Verified each function's client construction: `create-job-invoice:66,152`, `generate-receipt-pdf:30-31,332`, `job-reminder-2day:18-20,232`, `mark-invoice-reminder-sent:42-44,76`, `mark-reminder-sent:62-64,106`, `send-invoice-whatsapp:29-32,489`, `send-outstanding-invoice-reminders:38-39,202,277`, `send-payment-link:28-30,186`, `send-payment-received:36-71,268`, `send-schedule-confirmation:23-24,170`, `send-whatsapp-receipt:23-25,273`, `sumup-payment-webhook:65-73,289`, `trigger-review-request:34-36,169`, plus `_shared/duplicateJob.ts:93-94` (called by the two Tally functions, both service-role).

`send-payment-link` is the only one that also builds a caller-JWT client (`asCaller`, line 49) — but the `service_calls` update at line 186 uses the service-role `supabase` var, not `asCaller`.

### RPC / database functions

Only two functions in `public` contain `UPDATE … service_calls`: `recompute_job_parts_status` and `reset_org_data`. Both are `SECURITY DEFINER` and **`authenticated` has no EXECUTE privilege on either**, so neither is a frontend path. `respond_to_quote` (called at `src/pages/QuoteDetail.tsx:119`) only *inserts* into `service_calls`; it never updates.

Triggers on the table (`set_job_reference`, `trg_log_job_booked_activity`, `trg_log_job_completed_activity`, `trg_notify_on_job_change`, `trg_sync_invoice_status_from_job`, `update_service_calls_updated_at`) all fire on the row already being written, so they are not an independent write path.

## 2. Can an engineer update a job that isn't theirs today?

**Yes — confirmed, and only RLS is stopping it from being a supported flow.**

- `src/pages/engineer/EngineerJobDetail.tsx:142-145` loads the job by route id with `.select("*").eq("id", id)` and **no** `assigned_engineer_id` filter. Any engineer can open `/engineer/job/<any job id in their org>` by URL and the page will render and let them write via line 371.
- The list surfaces themselves are correctly scoped: `useEngineerJobs.ts:173-176` filters `.eq("assigned_engineer_id", engineerId)`, and `EngineerOutstandingBalances.tsx:76` filters `.eq("assigned_engineer_id", eng.id)`. So there is **no** intentional "cover a colleague's job", shared team action, or cross-engineer status update in the UI.
- The real escalation route is `engineers.can_access_office`. `src/hooks/useUserRole.ts:66` sets `canAccessOffice: elevated || !!engineerRow?.can_access_office`, and `src/components/shared/OfficeRoute.tsx:18` lets those users into office views — Schedule, JobDetail, IncomingJobs — where they legitimately assign and edit any job in the org.
- Live data check: only two rows have `can_access_office = true`, and both are already elevated (`barry mckenna`, role `admin`; `barry manager`, role `owner`). **No row with `role = 'engineer'` has `can_access_office = true` today**, so narrowing breaks nothing right now — but the flag must be in the policy or the first office-enabled engineer silently loses write access.
- Office staff holding an engineer record: `nicole office manager` (`engineers.role = 'office'`, `profiles.role = 'admin'`) and `barry` in Dublin Gas (`engineers.role = 'owner'`, `profiles.role = 'superadmin'`). Both resolve to a non-engineer role, so a role-branched policy leaves them on the org-wide branch. Also note `engineers.auth_user_id` is unique per row — no user maps to two engineer records, so `get_engineer_id`'s `LIMIT 1` is unambiguous today.

## 3. Role values in use, and the established RLS role pattern

Live counts:

- `engineers.role`: `engineer` (8), `admin` (2), `office` (2), `owner` (2)
- `profiles.role`: `engineer` (5), `admin` (3), `superadmin` (3)
- No `manager` row exists today, though several policies already allow it.

`get_user_role()` **reads `engineers.role` first**, then `profiles.role`, then defaults to `'engineer'`:

```sql
SELECT COALESCE(
  (SELECT role FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
  (SELECT role FROM public.profiles  WHERE user_id      = _user_id LIMIT 1),
  'engineer');
```

Two consequences for the new policy: `profiles.role = 'superadmin'` is *shadowed* when the user has an engineer row (Dublin Gas `barry` resolves to `owner`), and the `'engineer'` fallback means any user with no row in either table lands on the restrictive branch.

The canonical pattern used elsewhere is an elevated-role allowlist plus the org check — use this verbatim so the new policy matches:

```sql
-- public.categories, UPDATE
(organisation_id = get_my_org_id())
AND (get_user_role(auth.uid()) = ANY (ARRAY['admin','office','owner','manager']))

-- public.engineers, UPDATE (self-service variant)
(organisation_id = get_my_org_id())
AND ((get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin']))
     OR (auth_user_id = auth.uid()))
```

`public.debug_logs` INSERT is the closest precedent for engineer-self scoping: `engineer_id = get_engineer_id(auth.uid())` OR elevated-role allowlist. `parts_requests` has the only other `assigned_engineer_id`-style ownership policies (`parts_requests_update_own_open_engineer_id`, `..._delete_own_open_engineer_id`).

## 4. `get_engineer_id(auth.uid())`

Exists, `STABLE SECURITY DEFINER`, `SET search_path = public`:

```sql
CREATE OR REPLACE FUNCTION public.get_engineer_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT id FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1; $$
```

It returns `engineers.id` — the same value `service_calls.assigned_engineer_id` stores, and the same lookup `useEngineerJobs.ts:128-132` performs client-side. It is **not org-scoped**, which is fine because `auth_user_id` is unique across `engineers` today, and it returns NULL for a user with no engineer row (so `assigned_engineer_id = NULL` is never true — the restrictive branch fails closed, correctly).

Related helpers, all `SECURITY DEFINER`: `get_my_org_id()` (impersonation token → JWT `app_metadata` → `profiles` fallback), `get_user_organisation_id(uuid)` (`profiles` then `engineers`), `get_user_role(uuid)` as above.

## 5. Live RLS policies on `service_calls` (role `authenticated`, all PERMISSIVE)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| `service_calls_org_isolation` | ALL | `organisation_id = get_my_org_id()` | — |
| `service_calls_select` | SELECT | `organisation_id = get_my_org_id()` | — |
| `service_calls_insert` | INSERT | — | `organisation_id = get_my_org_id()` |
| `service_calls_update` | UPDATE | `organisation_id = get_my_org_id()` | `organisation_id = get_my_org_id()` |
| `service_calls_delete` | DELETE | `organisation_id = get_my_org_id()` | — |

No policies exist for `anon` or `service_role` on this table.

**This is the blocker for the fix as currently framed.** Permissive policies OR together, and `service_calls_org_isolation` covers `ALL` commands — so tightening `service_calls_update` alone changes nothing: `org_isolation` will still grant the UPDATE on its own. BJ-0090c-fix must either drop/replace `service_calls_org_isolation`, or split it into per-command policies, or add the engineer restriction as a `RESTRICTIVE` policy. Migration history is also unreliable here: the newest repo definition of `service_calls_select` (`supabase/migrations/20260423152056_…sql:20-34`) is role-branched, but live is org-only, and no migration in the repo produces the live state.

## 6. Cron / scheduled / background writers using an engineer's own JWT

None. All six active `cron.job` entries POST to Edge Functions with an `x-webhook-secret` from vault (`send-deposit-reminder-daily`, `warranty-auto-send`, `quote-followup-day3`, `quote-followup-day6`, `job-reminder-2day-0900-dublin`), and the sixth calls `public.purge_old_read_notifications()` which touches `notifications` only. Every function that writes `service_calls` uses the service-role key (section 1), so no scheduled process is affected by a narrower policy.

One adjacent frontend risk worth knowing about, not a cron: `useEngineerJobs.ts:387` failures are pushed into an offline retry queue keyed on `{ table: "service_calls", operation: "update" }`. After the policy narrows, a write that RLS now refuses returns an error and will be retried rather than discarded — the fix's probe plan should confirm a denied write does not loop in that queue.

## AUDIT VERDICT — CLEAR TO NARROW, WITH THREE CONDITIONS

- Nothing depends on the broad access: every engineer-reachable write is `.eq("id", …)`-only and relies on RLS, and no UI flow, cron, or Edge Function needs an engineer to write someone else's job.
- The permissive `service_calls_org_isolation` ALL policy must be dropped or split in the same migration, or the narrowed UPDATE policy has no effect.
- The engineer branch must allow `can_access_office = true` alongside the elevated-role allowlist, or the first office-enabled engineer loses write access.
- Keep `src/pages/CustomerDetail.tsx:384-389`'s multi-row `boiler_brand` update working (office/admin branch), and re-check the offline retry queue behaviour on a denied write.
