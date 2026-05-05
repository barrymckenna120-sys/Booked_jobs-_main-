
DROP POLICY IF EXISTS "anon_select_invoices" ON public.invoices;

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  recipient_user_id = auth.uid()
  OR recipient_user_id IN (
    SELECT auth_user_id FROM public.engineers
    WHERE organisation_id = public.get_user_organisation_id(auth.uid())
      AND auth_user_id IS NOT NULL
  )
);

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
    'viewer'
  );
$function$;

DROP POLICY IF EXISTS "Authenticated users can insert brand_settings" ON public.brand_settings;
DROP POLICY IF EXISTS "Authenticated users can update brand_settings" ON public.brand_settings;

CREATE POLICY "Org members can insert brand_settings"
ON public.brand_settings
FOR INSERT
TO authenticated
WITH CHECK (organisation_id_ref = public.get_user_organisation_id(auth.uid()));

CREATE POLICY "Org members can update brand_settings"
ON public.brand_settings
FOR UPDATE
TO authenticated
USING (organisation_id_ref = public.get_user_organisation_id(auth.uid()))
WITH CHECK (organisation_id_ref = public.get_user_organisation_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert message_log" ON public.message_log;
CREATE POLICY "Org members can insert message_log"
ON public.message_log
FOR INSERT
TO authenticated
WITH CHECK (organisation_id = public.get_user_organisation_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert service_call_tags" ON public.service_call_tags;
DROP POLICY IF EXISTS "Authenticated users can delete service_call_tags" ON public.service_call_tags;

CREATE POLICY "Org members can insert service_call_tags"
ON public.service_call_tags
FOR INSERT
TO authenticated
WITH CHECK (
  service_call_id IN (
    SELECT id FROM public.service_calls
    WHERE organisation_id = public.get_user_organisation_id(auth.uid())
       OR user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete service_call_tags"
ON public.service_call_tags
FOR DELETE
TO authenticated
USING (
  service_call_id IN (
    SELECT id FROM public.service_calls
    WHERE organisation_id = public.get_user_organisation_id(auth.uid())
       OR user_id = auth.uid()
  )
);
