CREATE OR REPLACE FUNCTION public.update_customer_last_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'Completed' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'Completed') THEN
    UPDATE public.customers
    SET last_service_date = COALESCE(NEW.scheduled_date, CURRENT_DATE),
        last_service_engineer = NEW.assigned_engineer
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_customer_last_service
AFTER UPDATE ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_last_service();