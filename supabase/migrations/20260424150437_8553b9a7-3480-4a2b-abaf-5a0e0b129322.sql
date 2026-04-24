CREATE POLICY "Service role and anon can insert message_log"
ON public.message_log
FOR INSERT
TO service_role, anon
WITH CHECK (true);