DROP POLICY IF EXISTS admin_select_all_orgs ON public.organisations;

CREATE POLICY admin_select_all_orgs
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