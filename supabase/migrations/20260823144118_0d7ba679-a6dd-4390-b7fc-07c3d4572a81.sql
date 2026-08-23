-- 1. Parts activity logging: drop the 'Fitted' branch.
CREATE OR REPLACE FUNCTION public.log_parts_request_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_org_id uuid;
  v_job_ref text;
  v_profile_id uuid;
  v_event_type text;
  v_verb text;
  v_label text;
  v_qty text;
  v_stamp timestamptz;
BEGIN
  -- Only log on insert, or on a real status transition.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'part_logged';
    v_verb := 'Part logged';
    v_stamp := COALESCE(NEW.created_at, now());
  ELSE
    CASE NEW.status
      WHEN 'Ordered' THEN
        v_event_type := 'part_ordered'; v_verb := 'Part ordered'; v_stamp := COALESCE(NEW.ordered_at, now());
      WHEN 'Ready to Fit' THEN
        v_event_type := 'part_ready'; v_verb := 'Part ready to fit'; v_stamp := COALESCE(NEW.ready_at, now());
      WHEN 'Cancelled' THEN
        v_event_type := 'part_cancelled'; v_verb := 'Part cancelled'; v_stamp := COALESCE(NEW.cancelled_at, now());
      ELSE
        -- Re-opened or an unknown status: nothing meaningful to log.
        RETURN NULL;
    END CASE;
  END IF;

  -- Customer: the row's own link, else inherited from the linked job.
  v_customer_id := NEW.customer_id;
  IF NEW.service_call_id IS NOT NULL THEN
    SELECT customer_id, job_reference INTO v_customer_id, v_job_ref
    FROM public.service_calls WHERE id = NEW.service_call_id;
    v_customer_id := COALESCE(NEW.customer_id, v_customer_id);
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN NULL; -- no customer to file this against
  END IF;

  SELECT organisation_id INTO v_org_id FROM public.customers WHERE id = v_customer_id;
  v_org_id := COALESCE(v_org_id, NEW.organisation_id);

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  v_qty := CASE WHEN NEW.quantity > 1 THEN NEW.quantity::text || ' × ' ELSE '' END;
  v_label := v_verb || ' — ' || v_qty || NEW.description
             || COALESCE(' (' || v_job_ref || ')', '');

  INSERT INTO public.customer_activity (
    organisation_id, customer_id, service_call_id,
    event_type, event_label, event_data, created_by, created_at
  ) VALUES (
    v_org_id, v_customer_id, NEW.service_call_id,
    v_event_type, v_label,
    jsonb_build_object(
      'parts_request_id', NEW.id,
      'description', NEW.description,
      'quantity', NEW.quantity,
      'priority', NEW.priority,
      'status', NEW.status,
      'job_reference', v_job_ref,
      'notes', NEW.notes,
      'logged_by_name', NEW.logged_by_name
    ),
    v_profile_id,
    v_stamp
  );

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_parts_request_activity() FROM PUBLIC, anon, authenticated;

-- 2. Remove the auto-mark-fitted-on-completion trigger and its function.
DROP TRIGGER IF EXISTS trg_mark_parts_fitted_on_completion ON public.service_calls;
DROP FUNCTION IF EXISTS public.mark_parts_fitted_on_completion();

-- 3. Remove the Fitted columns (no rows use them).
ALTER TABLE public.parts_requests DROP COLUMN IF EXISTS fitted_at;
ALTER TABLE public.parts_requests DROP COLUMN IF EXISTS fitted_by;

-- 4. Restore the original status set.
ALTER TABLE public.parts_requests DROP CONSTRAINT IF EXISTS parts_requests_status_check;
ALTER TABLE public.parts_requests
  ADD CONSTRAINT parts_requests_status_check
  CHECK (status = ANY (ARRAY['Open'::text, 'Ordered'::text, 'Ready to Fit'::text, 'Cancelled'::text]));

-- 5. Clean up any 'part_fitted' timeline rows (currently none).
DELETE FROM public.customer_activity WHERE event_type = 'part_fitted';