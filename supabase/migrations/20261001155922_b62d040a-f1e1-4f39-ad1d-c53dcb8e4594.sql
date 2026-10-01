CREATE TABLE public.fault_finder_settings (
  organisation_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'repair' CHECK (mode IN ('repair','install')),
  cta_url text NULL CHECK (cta_url IS NULL OR cta_url ~ '^https://'),
  allowed_origins text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.fault_finder_settings FROM anon;
REVOKE ALL ON public.fault_finder_settings FROM public;
GRANT SELECT, INSERT, UPDATE ON public.fault_finder_settings TO authenticated;
GRANT ALL ON public.fault_finder_settings TO service_role;

ALTER TABLE public.fault_finder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Office users can view their org fault finder settings"
ON public.fault_finder_settings
FOR SELECT
TO authenticated
USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

CREATE POLICY "Office users can insert their org fault finder settings"
ON public.fault_finder_settings
FOR INSERT
TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

CREATE POLICY "Office users can update their org fault finder settings"
ON public.fault_finder_settings
FOR UPDATE
TO authenticated
USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()))
WITH CHECK (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));

CREATE TRIGGER update_fault_finder_settings_updated_at
BEFORE UPDATE ON public.fault_finder_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();