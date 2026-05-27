CREATE POLICY "message_log_insert_kn_anon"
ON public.message_log
FOR INSERT
TO anon, authenticated
WITH CHECK (organisation_id = '8c37827f-ce2c-4507-a821-a5e807d89856'::uuid);