CREATE POLICY "Superadmin full access tenant_integrations"
ON public.tenant_integrations
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'superadmin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'superadmin'));

CREATE POLICY "Superadmin select all organisations"
ON public.organisations
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'superadmin'));