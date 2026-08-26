CREATE OR REPLACE FUNCTION public.prevent_engineer_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Allow service_role / edge function context (no auth.uid())
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    -- Allow superadmins
    IF public.get_user_role(auth.uid()) IN ('admin','owner','superadmin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only admins can change engineer roles';
  END IF;
  RETURN NEW;
END;
$function$;