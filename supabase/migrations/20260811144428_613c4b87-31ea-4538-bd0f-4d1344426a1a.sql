DROP POLICY IF EXISTS "Org scoped access" ON public.tenant_integrations;

CREATE POLICY "Org admins manage integrations"
ON public.tenant_integrations
FOR ALL
TO authenticated
USING (
  organisation_id = public.get_user_organisation_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('admin','owner','manager','office','superadmin')
)
WITH CHECK (
  organisation_id = public.get_user_organisation_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('admin','owner','manager','office','superadmin')
);