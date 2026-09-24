-- Temporary Fault Finder draft testing (per organisation, per named engineer).
CREATE TABLE public.fault_draft_test_orgs (
  organisation_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fault_draft_test_orgs TO authenticated;
GRANT ALL ON public.fault_draft_test_orgs TO service_role;
ALTER TABLE public.fault_draft_test_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage draft test orgs" ON public.fault_draft_test_orgs
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TABLE public.fault_draft_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fault_draft_testers TO authenticated;
GRANT ALL ON public.fault_draft_testers TO service_role;
ALTER TABLE public.fault_draft_testers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage draft testers" ON public.fault_draft_testers
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_fault_draft_test_orgs_updated BEFORE UPDATE ON public.fault_draft_test_orgs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fault_draft_testers_updated BEFORE UPDATE ON public.fault_draft_testers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Entries withheld from draft testing (e.g. unresolved review items). Does not touch status.
ALTER TABLE public.boiler_fault_codes ADD COLUMN draft_test_excluded boolean NOT NULL DEFAULT false;

-- True only for an enabled tester, in their own organisation, while that organisation's switch is on.
CREATE OR REPLACE FUNCTION public.can_view_draft_faults(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.fault_draft_testers t
    JOIN public.fault_draft_test_orgs o ON o.organisation_id = t.organisation_id AND o.enabled
    JOIN public.profiles p ON p.user_id = t.user_id AND p.organisation_id = t.organisation_id
    WHERE t.user_id = _user_id AND t.enabled
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_draft_faults(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_draft_faults(uuid) TO authenticated, service_role;

CREATE POLICY "Draft testers read draft fault models" ON public.boiler_fault_models
  FOR SELECT TO authenticated USING (status = 'draft' AND public.can_view_draft_faults(auth.uid()));
CREATE POLICY "Draft testers read draft fault codes" ON public.boiler_fault_codes
  FOR SELECT TO authenticated USING (status = 'draft' AND NOT draft_test_excluded AND public.can_view_draft_faults(auth.uid()));