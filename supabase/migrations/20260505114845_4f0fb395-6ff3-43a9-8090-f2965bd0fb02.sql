DROP POLICY IF EXISTS "Users can read job_messages in their org" ON public.job_messages;

CREATE POLICY "Users can read job_messages"
ON public.job_messages
FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.service_calls sc
    WHERE sc.id = job_messages.job_id
    AND (
      sc.user_id = auth.uid()
      OR sc.assigned_engineer_id = get_engineer_id(auth.uid())
      OR sc.organisation_id = get_user_organisation_id(auth.uid())
    )
  )
);