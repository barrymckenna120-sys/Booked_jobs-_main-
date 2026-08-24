# job_payments — per-payment ledger for jobs

One row per money event on a job, append-only. Replaces the current situation where the only record of a payment is a free-text `customer_activity` label (amount parsed out of a string, typed data on 7 of 126 rows, and four independent best-effort writers that can drop the event silently — the KN-520 class of bug).

Scope note: the table lands on its own, with nothing reading or writing it yet. Wiring the payment paths is a separate step after the migration is approved and applied, and backfill is deferred entirely.

## Step 1 — Migration: create the table

Columns:

| column | type | rules |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| organisation_id | uuid | **NOT NULL, no default**, FK to `organisations(id)` |
| service_call_id | uuid | NOT NULL, FK to `service_calls(id)` ON DELETE CASCADE |
| customer_id | uuid | NOT NULL, FK to `customers(id)` ON DELETE CASCADE |
| amount | numeric(10,2) | NOT NULL, must be non-zero |
| payment_type | text | NOT NULL, one of `deposit`, `balance`, `full`, `extra_work`, `refund`, `correction` |
| method | text | NOT NULL, one of `card`, `cash`, `sumup`, `bank_transfer`, `invoice` |
| source | text | NOT NULL, one of `office_modal`, `engineer_app`, `sumup_webhook`, `invoice`, `manual` — which code path recorded it |
| checkout_id | text | nullable, links a SumUp payment back to `payment_checkout_attempts.checkout_id` |
| reverses_payment_id | uuid | nullable, self-FK — how a correction or refund cancels an earlier row |
| note | text | nullable, free text for corrections |
| metadata | jsonb | nullable, raw provider payload |
| recorded_by | uuid | nullable (null for webhook/system writes) |
| paid_at | timestamptz | NOT NULL, when the money was actually taken |
| created_at | timestamptz | NOT NULL, `now()` |

No `updated_at` and no update trigger — the table is append-only, so a row never changes after insert.

Corrections are new rows, not edits: a wrong €200 becomes a `correction`/`refund` row of −200 with `reverses_payment_id` pointing at the original, plus the real row. The job's true collected total is always `sum(amount)`.

Indexes: `(service_call_id, paid_at DESC)`, `(organisation_id)`, `(checkout_id)`. `service_calls` has no index on any payment column today, so this table cannot lean on one.

Grants, per house rules:
```
GRANT SELECT, INSERT ON public.job_payments TO authenticated;
GRANT ALL ON public.job_payments TO service_role;
```
No `anon`, no `UPDATE`/`DELETE` grant to `authenticated` — the append-only guarantee is enforced at the privilege level as well as by policy.

RLS, mirroring the `quotes` / `certificates` house style but with no update/delete policy and no redundant `FOR ALL` policy:
```sql
CREATE POLICY job_payments_select ON public.job_payments
  FOR SELECT TO authenticated USING (organisation_id = get_my_org_id());

CREATE POLICY job_payments_insert ON public.job_payments
  FOR INSERT TO authenticated WITH CHECK (organisation_id = get_my_org_id());

CREATE POLICY job_payments_service_role ON public.job_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
Absent UPDATE and DELETE policies means no authenticated caller can ever modify or remove a row. Edge functions keep full access via `service_role` for webhook writes.

Nothing else changes in this step — no writes to the table, no code touched, `service_calls` untouched.

## Step 2 (separate approval) — wire the writers

After the table exists, add a shared insert helper and call it from every path that records money, alongside the existing `buildPaymentPatch` call so `service_calls` stays the fast read model:

- `TakePaymentModal.tsx` — office deposit / balance / full / invoice branches
- `useEngineerJobs.ts` and `EngineerJobDetail.tsx` — engineer completion
- `sumup-payment-webhook` (via `_shared/sumupWebhook.ts`) — card payments, with `checkout_id` set
- `ExtraWorkSheet.tsx` — the `increment` branch, currently logging no payment event at all
- `create-job-invoice` — invoice raised (recorded as a zero-collection event or skipped, decided at build time)

The engineer path must keep working offline, so the insert goes through the existing retry queue rather than an edge-function round trip.

## Step 3 (separate approval) — reconciliation read

A read-only check comparing `sum(job_payments.amount)` against `service_calls.revenue - balance_due` per job, to surface any future divergence of the kind that hid the KN-520 loss for two hours.

## Deferred

Backfilling historical payments from `payment_checkout_attempts`, `sumup_webhook_events`, and `customer_activity` labels. Revisit once new writes are proven correct; amounts parsed from free text would be approximate and that work needs its own isolated, review-gated step.

## Technical notes

- `organisation_id` is deliberately NOT NULL with **no** default. Four existing tables (`categories`, `job_tags`, `boiler_brands`, `debug_logs`) carry `DEFAULT get_my_org_id()`, which silently resolves to NULL under service-role and edge-function inserts — a cross-tenant hazard this table avoids by requiring every caller to pass the org explicitly, as `customer_activity` and `payment_checkout_attempts` already do.
- `payment_type`, `method`, and `source` use CHECK constraints rather than enums, matching `service_calls_customer_status_at_booking_check` — cheaper to extend later.
- The amount check is a plain `amount <> 0` (immutable, safe as a CHECK); negative values are permitted so refunds and corrections are expressible.
- `customer_activity` payment rows stay exactly as they are; they remain the customer-facing timeline, now derived from an authoritative ledger rather than being the only record.
