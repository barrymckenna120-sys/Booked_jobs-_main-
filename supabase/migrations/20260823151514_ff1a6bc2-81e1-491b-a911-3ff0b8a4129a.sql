-- ============================================================================
-- BJ-0071 / BJ-0072 — parts_requests tracking fields + comment log
--
-- SCOPE GUARANTEE: every column added here is INFORMATIONAL / TRACKING ONLY.
-- Parts cost is SUPPLIER cost. It must NEVER propagate into service_calls.revenue,
-- balance_due, payment_status, quotes or invoice totals. No trigger, view or
-- function in this migration reads or writes any pricing/billing column.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tracking columns on parts_requests (office-writable only, see trigger)
-- ---------------------------------------------------------------------------
ALTER TABLE public.parts_requests
  ADD COLUMN IF NOT EXISTS quoted_cost              numeric(10,2),
  ADD COLUMN IF NOT EXISTS actual_cost              numeric(10,2),
  ADD COLUMN IF NOT EXISTS cost_currency            text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS expected_delivery_date   date,
  ADD COLUMN IF NOT EXISTS customer_notified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS customer_notified_by     uuid,
  ADD COLUMN IF NOT EXISTS customer_notified_method text,
  ADD COLUMN IF NOT EXISTS quote_reference          text;

COMMENT ON COLUMN public.parts_requests.quoted_cost IS
  'Supplier quoted cost. Tracking only — never feeds customer pricing or revenue.';
COMMENT ON COLUMN public.parts_requests.actual_cost IS
  'Supplier actual cost. Tracking only — never feeds customer pricing or revenue.';
COMMENT ON COLUMN public.parts_requests.expected_delivery_date IS
  'Forward-looking ETA. Distinct from ordered_at/ready_at, which are event stamps.';
COMMENT ON COLUMN public.parts_requests.quote_reference IS
  'BJ-0072. Free-text, manually entered. No auto-inference, no FK to quotes.';

-- Non-negative costs. Static predicates only (no now(), no volatile calls).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parts_requests_quoted_cost_non_negative') THEN
    ALTER TABLE public.parts_requests
      ADD CONSTRAINT parts_requests_quoted_cost_non_negative
      CHECK (quoted_cost IS NULL OR quoted_cost >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parts_requests_actual_cost_non_negative') THEN
    ALTER TABLE public.parts_requests
      ADD CONSTRAINT parts_requests_actual_cost_non_negative
      CHECK (actual_cost IS NULL OR actual_cost >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parts_requests_notified_method_valid') THEN
    ALTER TABLE public.parts_requests
      ADD CONSTRAINT parts_requests_notified_method_valid
      CHECK (customer_notified_method IS NULL
             OR customer_notified_method IN ('whatsapp','phone','email','in_person'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parts_requests_expected_delivery
  ON public.parts_requests (organisation_id, expected_delivery_date)
  WHERE expected_delivery_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Office-only write guard for the new columns
--
-- Why a trigger and not a policy: the existing engineer UPDATE policies
-- (parts_requests_update_own_open / _own_open_engineer_id) permit ANY column
-- change while status = 'Open'. RLS has no column-level granularity, so without
-- this trigger an engineer could set a cost on their own open row.
--
-- The backend bypass is deliberately STRICTER than
-- protect_organisation_billing_fields (which bypasses on auth.uid() IS NULL
-- alone): it also requires current_user to be a backend role, so an anon
-- request — the only client context where auth.uid() is NULL — can never
-- satisfy it. Verified: no anon-executable SECURITY DEFINER function touches
-- parts_requests, and all 8 table policies are TO authenticated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_parts_request_office_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean;
BEGIN
  -- Backend / admin contexts only: service_role, postgres, supabase_admin AND
  -- no end-user JWT. Edge functions, webhooks and reviewed backfills land here.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     AND auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Office roles may write these fields at any status.
  IF auth.uid() IS NOT NULL
     AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.quoted_cost IS NOT NULL
              OR NEW.actual_cost IS NOT NULL
              OR NEW.expected_delivery_date IS NOT NULL
              OR NEW.customer_notified_at IS NOT NULL
              OR NEW.customer_notified_by IS NOT NULL
              OR NEW.customer_notified_method IS NOT NULL
              OR NEW.quote_reference IS NOT NULL
              OR NEW.cost_currency IS DISTINCT FROM 'EUR';
  ELSE
    v_changed := NEW.quoted_cost              IS DISTINCT FROM OLD.quoted_cost
              OR NEW.actual_cost              IS DISTINCT FROM OLD.actual_cost
              OR NEW.cost_currency            IS DISTINCT FROM OLD.cost_currency
              OR NEW.expected_delivery_date   IS DISTINCT FROM OLD.expected_delivery_date
              OR NEW.customer_notified_at     IS DISTINCT FROM OLD.customer_notified_at
              OR NEW.customer_notified_by     IS DISTINCT FROM OLD.customer_notified_by
              OR NEW.customer_notified_method IS DISTINCT FROM OLD.customer_notified_method
              OR NEW.quote_reference          IS DISTINCT FROM OLD.quote_reference;
  END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'Parts cost, delivery, customer-notified and quote reference fields are office-only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_parts_request_office_fields ON public.parts_requests;
CREATE TRIGGER trg_protect_parts_request_office_fields
  BEFORE INSERT OR UPDATE ON public.parts_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_parts_request_office_fields();

-- ---------------------------------------------------------------------------
-- 3. parts_request_comments — permanent comment log, RLS mirrors the parent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parts_request_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parts_request_id uuid NOT NULL REFERENCES public.parts_requests(id) ON DELETE CASCADE,
  organisation_id  uuid NOT NULL,
  body             text NOT NULL,
  author_id        uuid,
  author_name      text,
  author_role      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parts_request_comments_body_not_blank CHECK (btrim(body) <> '')
);

-- Data API needs explicit privileges; no anon (every policy scopes to auth).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_request_comments TO authenticated;
GRANT ALL ON public.parts_request_comments TO service_role;

ALTER TABLE public.parts_request_comments ENABLE ROW LEVEL SECURITY;

-- Read: org-wide, matching parts_requests_select (no role split on the parent).
CREATE POLICY parts_request_comments_select
  ON public.parts_request_comments FOR SELECT TO authenticated
  USING (organisation_id = get_my_org_id());

-- Create: anyone in the org, but only as themselves.
CREATE POLICY parts_request_comments_insert
  ON public.parts_request_comments FOR INSERT TO authenticated
  WITH CHECK (organisation_id = get_my_org_id() AND author_id = auth.uid());

-- Update / delete: the author, or office. Author-scoped is the comment analogue
-- of the parent's "own and Open" rule — comments have no status.
CREATE POLICY parts_request_comments_update_own
  ON public.parts_request_comments FOR UPDATE TO authenticated
  USING (organisation_id = get_my_org_id() AND author_id = auth.uid())
  WITH CHECK (organisation_id = get_my_org_id() AND author_id = auth.uid());

CREATE POLICY parts_request_comments_update_office
  ON public.parts_request_comments FOR UPDATE TO authenticated
  USING (organisation_id = get_my_org_id()
         AND get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin']))
  WITH CHECK (organisation_id = get_my_org_id()
         AND get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin']));

CREATE POLICY parts_request_comments_delete_own
  ON public.parts_request_comments FOR DELETE TO authenticated
  USING (organisation_id = get_my_org_id() AND author_id = auth.uid());

CREATE POLICY parts_request_comments_delete_office
  ON public.parts_request_comments FOR DELETE TO authenticated
  USING (organisation_id = get_my_org_id()
         AND get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin']));

CREATE INDEX IF NOT EXISTS idx_parts_request_comments_request
  ON public.parts_request_comments (parts_request_id, created_at);

DROP TRIGGER IF EXISTS trg_parts_request_comments_updated_at ON public.parts_request_comments;
CREATE TRIGGER trg_parts_request_comments_updated_at
  BEFORE UPDATE ON public.parts_request_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
