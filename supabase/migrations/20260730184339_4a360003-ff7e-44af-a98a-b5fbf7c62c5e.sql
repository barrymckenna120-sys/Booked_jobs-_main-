-- Engineers: restrict UPDATE targeting to own row unless privileged
DROP POLICY IF EXISTS engineers_update ON public.engineers;

CREATE POLICY engineers_update
ON public.engineers
FOR UPDATE
TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    OR auth_user_id = auth.uid()
  )
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND (
    public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner'])
    OR (
      NOT (role IS DISTINCT FROM (SELECT e2.role FROM public.engineers e2 WHERE e2.id = engineers.id))
      AND NOT (can_access_office IS DISTINCT FROM (SELECT e2.can_access_office FROM public.engineers e2 WHERE e2.id = engineers.id))
      AND NOT (status IS DISTINCT FROM (SELECT e2.status FROM public.engineers e2 WHERE e2.id = engineers.id))
    )
  )
);

-- Debug logs: scope inserts to caller's org / own engineer record
DROP POLICY IF EXISTS "Authenticated users can insert debug_logs" ON public.debug_logs;

CREATE POLICY "Authenticated users can insert debug_logs"
ON public.debug_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    engineer_id IS NULL
    OR engineer_id = public.get_engineer_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.engineers e
      WHERE e.id = debug_logs.engineer_id
        AND e.organisation_id = public.get_my_org_id()
        AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office','manager','superadmin'])
    )
  )
);