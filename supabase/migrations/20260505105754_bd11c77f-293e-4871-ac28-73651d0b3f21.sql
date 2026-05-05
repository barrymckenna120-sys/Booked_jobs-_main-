
-- 1. brand_settings
DROP POLICY IF EXISTS "Authenticated users can read brand_settings" ON public.brand_settings;
CREATE POLICY "Users can read brand_settings in their org"
ON public.brand_settings
FOR SELECT
TO authenticated
USING (organisation_id::uuid = get_user_organisation_id(auth.uid()));

-- 2. message_log
DROP POLICY IF EXISTS "Authenticated users can read message_log" ON public.message_log;
CREATE POLICY "Users can read message_log in their org"
ON public.message_log
FOR SELECT
TO authenticated
USING (organisation_id = get_user_organisation_id(auth.uid()));

-- 3. job_messages (column is job_id, not service_call_id)
DROP POLICY IF EXISTS "Authenticated users can read job messages" ON public.job_messages;
CREATE POLICY "Users can read job_messages in their org"
ON public.job_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_calls sc
    WHERE sc.id = job_messages.job_id
      AND sc.organisation_id = get_user_organisation_id(auth.uid())
  )
);
