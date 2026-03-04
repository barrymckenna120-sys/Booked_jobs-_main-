
-- Tighten insert policy to admin/office only
DROP POLICY "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'office'));
