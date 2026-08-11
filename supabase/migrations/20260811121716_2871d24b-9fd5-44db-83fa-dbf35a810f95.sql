CREATE TABLE public.parts_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_call_id uuid REFERENCES public.service_calls(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id),
  customer_name text,
  customer_address text,
  customer_phone text,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'Open',
  notes text,
  logged_by uuid,
  logged_by_name text,
  assigned_to uuid REFERENCES public.engineers(id),
  ordered_at timestamp with time zone,
  ready_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT parts_requests_status_check CHECK (status IN ('Open','Ordered','Ready to Fit','Cancelled')),
  CONSTRAINT parts_requests_priority_check CHECK (priority IN ('urgent','normal','low')),
  CONSTRAINT parts_requests_quantity_check CHECK (quantity > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_requests TO authenticated;
GRANT ALL ON public.parts_requests TO service_role;

ALTER TABLE public.parts_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_requests_select" ON public.parts_requests
  FOR SELECT TO authenticated USING (organisation_id = public.get_my_org_id());
CREATE POLICY "parts_requests_insert" ON public.parts_requests
  FOR INSERT TO authenticated WITH CHECK (organisation_id = public.get_my_org_id());
CREATE POLICY "parts_requests_update" ON public.parts_requests
  FOR UPDATE TO authenticated USING (organisation_id = public.get_my_org_id())
  WITH CHECK (organisation_id = public.get_my_org_id());
CREATE POLICY "parts_requests_delete" ON public.parts_requests
  FOR DELETE TO authenticated USING (organisation_id = public.get_my_org_id());

CREATE INDEX idx_parts_requests_org_status ON public.parts_requests (organisation_id, status);
CREATE INDEX idx_parts_requests_service_call ON public.parts_requests (service_call_id);
CREATE INDEX idx_parts_requests_assigned_to ON public.parts_requests (assigned_to);

CREATE TRIGGER update_parts_requests_updated_at
BEFORE UPDATE ON public.parts_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Customer identification: linked customer OR at least a typed-in name
CREATE OR REPLACE FUNCTION public.validate_parts_request_customer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND (NEW.customer_name IS NULL OR btrim(NEW.customer_name) = '') THEN
    RAISE EXCEPTION 'parts_requests requires customer_id or customer_name';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_parts_request_customer
BEFORE INSERT OR UPDATE ON public.parts_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_parts_request_customer();

-- Keep the parent job's status in step with its parts lines
CREATE OR REPLACE FUNCTION public.sync_job_status_from_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_current_status text;
  v_new_status text;
  v_has_open boolean;
  v_has_ordered boolean;
  v_has_ready boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_job_id := OLD.service_call_id;
  ELSE
    v_job_id := NEW.service_call_id;
    IF TG_OP = 'UPDATE' AND OLD.service_call_id IS DISTINCT FROM NEW.service_call_id
       AND OLD.service_call_id IS NOT NULL THEN
      PERFORM public.recompute_job_parts_status(OLD.service_call_id);
    END IF;
  END IF;

  IF v_job_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.recompute_job_parts_status(v_job_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_job_parts_status(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_new_status text;
  v_has_open boolean;
  v_has_ordered boolean;
  v_has_ready boolean;
BEGIN
  SELECT status INTO v_current_status FROM public.service_calls WHERE id = _job_id;
  IF v_current_status IS NULL THEN
    RETURN;
  END IF;

  -- Only these statuses may be overwritten by a parts state change.
  -- Completed, Cancelled, In Progress, no_show, Awaiting Deposit, Pending and
  -- anything else are never touched.
  IF v_current_status NOT IN ('Scheduled','Booked','En Route','On Site',
                              'parts_needed','parts_ordered','parts_arrived') THEN
    RETURN;
  END IF;

  SELECT
    bool_or(status = 'Open'),
    bool_or(status = 'Ordered'),
    bool_or(status = 'Ready to Fit')
  INTO v_has_open, v_has_ordered, v_has_ready
  FROM public.parts_requests
  WHERE service_call_id = _job_id
    AND status IN ('Open','Ordered','Ready to Fit');

  IF COALESCE(v_has_open, false) THEN
    v_new_status := 'parts_needed';
  ELSIF COALESCE(v_has_ordered, false) THEN
    v_new_status := 'parts_ordered';
  ELSIF COALESCE(v_has_ready, false) THEN
    v_new_status := 'parts_arrived';
  ELSIF v_current_status IN ('parts_needed','parts_ordered','parts_arrived') THEN
    v_new_status := 'Scheduled';
  ELSE
    RETURN;
  END IF;

  IF v_new_status IS DISTINCT FROM v_current_status THEN
    UPDATE public.service_calls SET status = v_new_status WHERE id = _job_id;
  END IF;
END;
$$;

CREATE TRIGGER trg_sync_job_status_from_parts
AFTER INSERT OR UPDATE OR DELETE ON public.parts_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_job_status_from_parts();