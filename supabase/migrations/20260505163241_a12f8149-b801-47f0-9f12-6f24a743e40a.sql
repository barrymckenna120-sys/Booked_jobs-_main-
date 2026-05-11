
DROP POLICY IF EXISTS "Users can view their own engineers" ON public.engineers;
CREATE POLICY "Users can view their own engineers" ON public.engineers
FOR SELECT TO authenticated
USING (auth.uid() = auth_user_id OR organisation_id = public.get_user_organisation_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own quotes" ON public.quotes;
CREATE POLICY "Users can view their own quotes" ON public.quotes
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR organisation_id = public.get_user_organisation_id(auth.uid()));

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
FOR SELECT TO authenticated
USING (recipient_user_id = auth.uid() OR organisation_id = public.get_user_organisation_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own settings" ON public.settings;
CREATE POLICY "Users can view their own settings" ON public.settings
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR organisation_id = public.get_user_organisation_id(auth.uid()));
