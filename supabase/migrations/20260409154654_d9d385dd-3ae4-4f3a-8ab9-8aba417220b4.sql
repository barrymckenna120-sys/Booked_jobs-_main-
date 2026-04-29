
CREATE OR REPLACE FUNCTION public.log_payment_received_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_job_ref text;
  v_method text;
  v_amount text;
BEGIN
  IF NEW.payment_status = 'paid'
     AND (OLD.payment_status IS DISTINCT FROM 'paid')
  THEN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

    v_job_ref := COALESCE(NEW.job_reference, 'KN-' || upper(left(NEW.id::text, 6)));

    v_method := CASE NEW.payment_method
      WHEN 'cash' THEN 'Cash'
      WHEN 'card' THEN 'Card'
      WHEN 'invoice' THEN 'Invoice'
      ELSE initcap(COALESCE(NEW.payment_method, 'Unknown'))
    END;

    v_amount := COALESCE(TRIM(TO_CHAR(NEW.revenue, 'FM999,999')), '0');

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
      'payment_received',
      'Payment received — €' || v_amount || ' — ' || v_method,
      v_profile_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_payment_received_activity
AFTER UPDATE ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION public.log_payment_received_activity();
