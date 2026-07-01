CREATE OR REPLACE FUNCTION public.prevent_engineer_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF public.get_user_role(auth.uid()) IN ('admin','office','owner','manager','superadmin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only admin, office, owner, or manager users can change engineer roles';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_engineer_role_escalation_trg ON public.engineers;
CREATE TRIGGER prevent_engineer_role_escalation_trg
BEFORE UPDATE OF role ON public.engineers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_engineer_role_escalation();