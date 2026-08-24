# Plan: Create `job_payments` ledger table

## Goal
Create an append-only `public.job_payments` table to record every payment event against a job and customer, with strict RLS and no update/delete path.

## Migration contents

```sql
CREATE TABLE public.job_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  service_call_id uuid NOT NULL REFERENCES public.service_calls(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount numeric(10,2) NOT NULL CHECK (amount <> 0),
  payment_type text NOT NULL CHECK (payment_type IN ('deposit','balance','full','extra_work','refund','correction')),
  method text NOT NULL CHECK (method IN ('card','cash','sumup','bank_transfer','invoice')),
  source text NOT NULL CHECK (source IN ('office_modal','engineer_app','sumup_webhook','invoice','manual')),
  checkout_id text REFERENCES public.payment_checkout_attempts(checkout_id),
  reverses_payment_id uuid REFERENCES public.job_payments(id),
  note text,
  metadata jsonb,
  recorded_by uuid,
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_payments_service_call ON public.job_payments (service_call_id, paid_at DESC);
CREATE INDEX idx_job_payments_org ON public.job_payments (organisation_id);
CREATE INDEX idx_job_payments_checkout ON public.job_payments (checkout_id);

ALTER TABLE public.job_payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.job_payments TO authenticated;
GRANT ALL ON public.job_payments TO service_role;

CREATE POLICY job_payments_select ON public.job_payments
  FOR SELECT TO authenticated USING (organisation_id = get_my_org_id());

CREATE POLICY job_payments_insert ON public.job_payments
  FOR INSERT TO authenticated WITH CHECK (organisation_id = get_my_org_id());

CREATE POLICY job_payments_service_role ON public.job_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## Notes
- `checkout_id` is `text` and now has a foreign-key reference to `payment_checkout_attempts(checkout_id)`, which is backed by a unique index (`payment_checkout_attempts_checkout_id_key`).
- `service_call_id` and `customer_id` use `ON DELETE RESTRICT` to protect the financial audit trail.
- No UPDATE or DELETE policies — append-only by design.
- **Pre-run finding:** `src/pages/CustomerDetail.tsx:288` calls `supabase.from("customers").delete().eq("id", id)`. Once a customer has `job_payments` rows, that delete will be blocked. No direct `service_calls` delete path was found.

## Verification after run
- Table created with listed columns/types/constraints/foreign keys.
- RLS enabled.
- Three policies present (`job_payments_select`, `job_payments_insert`, `job_payments_service_role`).
- Three indexes present (`idx_job_payments_service_call`, `idx_job_payments_org`, `idx_job_payments_checkout`).
