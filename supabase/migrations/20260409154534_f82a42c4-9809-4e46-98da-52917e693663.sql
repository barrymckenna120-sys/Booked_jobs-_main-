
CREATE OR REPLACE FUNCTION public.log_job_completed_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_job_ref text;
BEGIN
  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

    v_job_ref := COALESCE(NEW.job_reference, 'KN-' || upper(left(NEW.id::text, 6)));

    INSERT INTO public.customer_activity (
      organisation_id,
      customer_id,
      service_call_id,
      event_type,
      event_label,
      created_by
    ) VALUES (
      NEW.organisation_id,
      NEW.customer_id,
      NEW.id,
      'job_completed',
      'Job completed — ' || v_job_ref,
      v_profile_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_job_completed_activity
AFTER UPDATE ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION public.log_job_completed_activity();
