CREATE POLICY "Superadmin read all settings"
ON public.settings
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
));