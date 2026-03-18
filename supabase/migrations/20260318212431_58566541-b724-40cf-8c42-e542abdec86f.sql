CREATE POLICY "service_role_insert" ON public.service_calls
FOR INSERT
TO service_role
WITH CHECK (true);