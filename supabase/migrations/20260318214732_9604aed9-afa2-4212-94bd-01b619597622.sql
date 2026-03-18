CREATE POLICY "service_role_insert" ON public.customers
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "service_role_update" ON public.customers
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_select" ON public.customers
FOR SELECT
TO service_role
USING (true);