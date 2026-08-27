CREATE POLICY "message_log_insert_dublin_gas"
ON public.message_log
FOR INSERT
TO authenticated, anon
WITH CHECK (organisation_id = 'f1950683-e8b9-41cf-8972-2aa59516850d'::uuid);