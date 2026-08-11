DROP POLICY IF EXISTS notifications_org_isolation ON public.notifications;

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    organisation_id = get_my_org_id()
    AND (
      recipient_user_id = auth.uid()
      OR get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office'])
    )
  )
  WITH CHECK (
    organisation_id = get_my_org_id()
    AND (
      recipient_user_id = auth.uid()
      OR get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office'])
    )
  );

DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (
    organisation_id = get_my_org_id()
    AND (
      recipient_user_id = auth.uid()
      OR get_user_role(auth.uid()) = ANY (ARRAY['admin','owner','office'])
    )
  );