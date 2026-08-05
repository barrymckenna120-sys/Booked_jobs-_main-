CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  filename text NOT NULL,
  imported_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  total_rows int NOT NULL DEFAULT 0,
  created_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  row_details jsonb NOT NULL DEFAULT '[]'
);

GRANT SELECT, INSERT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_runs_select_own_org"
ON public.import_runs FOR SELECT TO authenticated
USING (organisation_id = public.get_my_org_id());

CREATE POLICY "import_runs_select_superadmin"
ON public.import_runs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
));

CREATE POLICY "import_runs_insert_own_org"
ON public.import_runs FOR INSERT TO authenticated
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND imported_by = auth.uid()
);

CREATE INDEX import_runs_org_created_idx
ON public.import_runs (organisation_id, created_at DESC);

CREATE INDEX import_runs_created_idx
ON public.import_runs (created_at DESC);