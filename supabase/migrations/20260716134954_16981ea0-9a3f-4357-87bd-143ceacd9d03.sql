DROP POLICY IF EXISTS message_log_insert ON public.message_log;

CREATE POLICY message_log_insert
ON public.message_log
FOR INSERT
TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());