CREATE TABLE public.gdpr_erasures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer')),
  entity_id uuid NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT now(),
  erased_by uuid,
  reason text,
  UNIQUE (organisation_id, entity_type, entity_id)
);

COMMENT ON TABLE public.gdpr_erasures IS
  'IDs only, never personal data. Restores must never bring these records (or rows linked to them) back.';

ALTER TABLE public.gdpr_erasures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gdpr_erasures FROM anon, authenticated;
GRANT SELECT ON public.gdpr_erasures TO authenticated;

CREATE POLICY "Superadmins read gdpr erasures" ON public.gdpr_erasures
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));

-- No write policies: entries are added only by superadmin tooling / service role.