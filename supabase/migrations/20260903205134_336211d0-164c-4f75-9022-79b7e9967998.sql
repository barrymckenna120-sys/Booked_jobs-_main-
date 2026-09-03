CREATE TABLE public.support_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid NOT NULL DEFAULT get_my_org_id(),
  report_type text NOT NULL CHECK (report_type IN ('bug','feedback','question')),
  message text NOT NULL,
  submitted_by uuid NOT NULL DEFAULT auth.uid(),
  submitted_by_name text,
  submitted_by_role text,
  app text CHECK (app IN ('office','engineer')),
  screen text,
  route text,
  browser text,
  browser_version text,
  os text,
  device_type text,
  viewport text,
  app_version text,
  is_online boolean,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX support_reports_created_at_idx ON public.support_reports (created_at DESC);
CREATE INDEX support_reports_org_idx ON public.support_reports (organisation_id);

GRANT SELECT, INSERT ON public.support_reports TO authenticated;
GRANT ALL ON public.support_reports TO service_role;

ALTER TABLE public.support_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_reports_insert_own_org ON public.support_reports
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = get_my_org_id() AND submitted_by = auth.uid());

CREATE POLICY support_reports_select_own_org ON public.support_reports
  FOR SELECT TO authenticated
  USING (organisation_id = get_my_org_id());

CREATE POLICY support_reports_select_superadmin ON public.support_reports
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
  ));
