CREATE OR REPLACE FUNCTION public.get_user_organisation_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN nullif(current_setting('request.jwt.claims', true), '') IS NULL
      OR (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
      OR _user_id = auth.uid()
      OR public.is_superadmin(auth.uid())
    THEN COALESCE(
      (SELECT organisation_id FROM public.profiles WHERE user_id = _user_id LIMIT 1),
      (SELECT organisation_id FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1)
    )
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN nullif(current_setting('request.jwt.claims', true), '') IS NULL
      OR (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
      OR _user_id = auth.uid()
      OR public.is_superadmin(auth.uid())
    THEN COALESCE(
      (SELECT role FROM public.engineers WHERE auth_user_id = _user_id AND role <> 'superadmin' LIMIT 1),
      (SELECT role FROM public.profiles  WHERE user_id      = _user_id LIMIT 1),
      'engineer'
    )
    ELSE NULL
  END;
$function$;