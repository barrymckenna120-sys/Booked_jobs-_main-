CREATE TABLE public.engineer_performance_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid NOT NULL DEFAULT public.get_my_org_id(),
  engineer_id uuid NOT NULL REFERENCES public.engineers(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('week','month')),
  period_start date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engineer_performance_notes_unique_period
    UNIQUE (organisation_id, engineer_id, period_type, period_start)
);

CREATE INDEX idx_engineer_performance_notes_lookup
  ON public.engineer_performance_notes (organisation_id, period_type, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engineer_performance_notes TO authenticated;
GRANT ALL ON public.engineer_performance_notes TO service_role;

ALTER TABLE public.engineer_performance_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Office can view own org engineer notes"
ON public.engineer_performance_notes FOR SELECT TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','superadmin')
);

CREATE POLICY "Office can create own org engineer notes"
ON public.engineer_performance_notes FOR INSERT TO authenticated
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','superadmin')
);

CREATE POLICY "Office can update own org engineer notes"
ON public.engineer_performance_notes FOR UPDATE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','superadmin')
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','superadmin')
);

CREATE POLICY "Office can delete own org engineer notes"
ON public.engineer_performance_notes FOR DELETE TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) IN ('office','admin','superadmin')
);

CREATE TRIGGER update_engineer_performance_notes_updated_at
BEFORE UPDATE ON public.engineer_performance_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();