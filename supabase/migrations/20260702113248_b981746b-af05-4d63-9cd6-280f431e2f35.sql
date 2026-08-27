
-- Block engineers from escalating their own role or office access via engineers_update.
-- Non-admin/owner users may still update their own row for benign fields (fcm_token, phone, etc.),
-- but any attempt to change role/can_access_office/status will be rejected.

DROP POLICY IF EXISTS engineers_update ON public.engineers;

CREATE POLICY engineers_update ON public.engineers
FOR UPDATE
USING (organisation_id = get_my_org_id())
WITH CHECK (
  organisation_id = get_my_org_id()
  AND (
    -- Admin/owner may change privileged columns freely
    get_user_role(auth.uid()) IN ('admin','owner')
    OR (
      -- Everyone else must leave privileged columns unchanged
      role IS NOT DISTINCT FROM (SELECT e2.role FROM public.engineers e2 WHERE e2.id = engineers.id)
      AND can_access_office IS NOT DISTINCT FROM (SELECT e2.can_access_office FROM public.engineers e2 WHERE e2.id = engineers.id)
      AND status IS NOT DISTINCT FROM (SELECT e2.status FROM public.engineers e2 WHERE e2.id = engineers.id)
    )
  )
);
