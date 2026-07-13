DROP POLICY IF EXISTS "Admins can read tenant_activity_log" ON public.tenant_activity_log;
DROP POLICY IF EXISTS "Admins can insert tenant_activity_log" ON public.tenant_activity_log;

CREATE POLICY "Superadmins can read tenant_activity_log"
ON public.tenant_activity_log
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
));

CREATE POLICY "Superadmins can insert tenant_activity_log"
ON public.tenant_activity_log
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
));