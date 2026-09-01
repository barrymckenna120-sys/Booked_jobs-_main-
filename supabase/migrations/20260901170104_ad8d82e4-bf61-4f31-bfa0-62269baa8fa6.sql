DROP POLICY IF EXISTS service_calls_update ON public.service_calls;

CREATE POLICY service_calls_update ON public.service_calls
FOR UPDATE
TO authenticated
USING (
  organisation_id = get_my_org_id()
  AND (
    get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    OR EXISTS (
      SELECT 1 FROM public.engineers
      WHERE auth_user_id = auth.uid() AND can_access_office = true
    )
    OR assigned_engineer_id = get_engineer_id(auth.uid())
  )
)
WITH CHECK (
  organisation_id = get_my_org_id()
  AND (
    get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    OR EXISTS (
      SELECT 1 FROM public.engineers
      WHERE auth_user_id = auth.uid() AND can_access_office = true
    )
    OR assigned_engineer_id = get_engineer_id(auth.uid())
  )
);