CREATE OR REPLACE FUNCTION public.mark_parts_fitted_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    UPDATE public.parts_requests
    SET status = 'Fitted',
        fitted_at = COALESCE(NEW.completed_at, now()),
        fitted_by = auth.uid()
    WHERE service_call_id = NEW.id
      AND status = 'Ready to Fit';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_parts_fitted_on_completion() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_parts_fitted_on_completion ON public.service_calls;
CREATE TRIGGER trg_mark_parts_fitted_on_completion
AFTER UPDATE OF status ON public.service_calls
FOR EACH ROW EXECUTE FUNCTION public.mark_parts_fitted_on_completion();