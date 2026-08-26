DROP POLICY IF EXISTS "Superadmins can view all organisations" ON public.organisations;
CREATE POLICY "Superadmins can view all organisations"
ON public.organisations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'superadmin'
  )
);