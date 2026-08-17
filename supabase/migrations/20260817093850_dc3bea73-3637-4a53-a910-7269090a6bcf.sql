DROP POLICY IF EXISTS engineers_update ON public.engineers;

CREATE POLICY engineers_update ON public.engineers
FOR UPDATE
USING (
  organisation_id = get_my_org_id()
  AND (
    get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    OR auth_user_id = auth.uid()
  )
)
WITH CHECK (
  organisation_id = get_my_org_id()
  AND (
    get_user_role(auth.uid()) = ANY (ARRAY['admin','owner'])
    OR (
      NOT (role IS DISTINCT FROM (SELECT e2.role FROM public.engineers e2 WHERE e2.id = engineers.id))
      AND NOT (can_access_office IS DISTINCT FROM (SELECT e2.can_access_office FROM public.engineers e2 WHERE e2.id = engineers.id))
      AND NOT (status IS DISTINCT FROM (SELECT e2.status FROM public.engineers e2 WHERE e2.id = engineers.id))
      -- Non-admin self-edits may never re-point the record at another account.
      AND NOT (auth_user_id IS DISTINCT FROM (SELECT e2.auth_user_id FROM public.engineers e2 WHERE e2.id = engineers.id))
    )
  )
);