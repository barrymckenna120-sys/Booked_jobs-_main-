DROP POLICY IF EXISTS engineers_insert ON public.engineers;

CREATE POLICY engineers_insert ON public.engineers
FOR INSERT TO authenticated
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    OR role = 'engineer'
  )
);