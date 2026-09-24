CREATE TABLE public.boiler_fault_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model_family text NOT NULL,
  model_name text NOT NULL,
  gc_or_serial_range text,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','rejected')),
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, model_name)
);
CREATE TABLE public.boiler_fault_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.boiler_fault_models(id) ON DELETE CASCADE,
  code text NOT NULL,
  explanation text NOT NULL,
  possible_causes text[] NOT NULL DEFAULT '{}',
  technical_details text,
  manual_title text NOT NULL,
  manual_url text NOT NULL,
  manual_revision text,
  manual_page text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','rejected')),
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, code)
);
CREATE INDEX boiler_fault_codes_model_status_idx ON public.boiler_fault_codes (model_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boiler_fault_models TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boiler_fault_codes TO authenticated;
GRANT ALL ON public.boiler_fault_models TO service_role;
GRANT ALL ON public.boiler_fault_codes TO service_role;

ALTER TABLE public.boiler_fault_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boiler_fault_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read published fault models" ON public.boiler_fault_models
  FOR SELECT TO authenticated USING (status = 'published' OR public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins manage fault models" ON public.boiler_fault_models
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Signed-in users read published fault codes" ON public.boiler_fault_codes
  FOR SELECT TO authenticated USING (
    (status = 'published' AND EXISTS (SELECT 1 FROM public.boiler_fault_models m WHERE m.id = model_id AND m.status = 'published'))
    OR public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmins manage fault codes" ON public.boiler_fault_codes
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER boiler_fault_models_updated_at BEFORE UPDATE ON public.boiler_fault_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER boiler_fault_codes_updated_at BEFORE UPDATE ON public.boiler_fault_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();