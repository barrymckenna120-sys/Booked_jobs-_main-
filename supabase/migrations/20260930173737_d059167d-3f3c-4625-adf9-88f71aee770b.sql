CREATE TABLE public.failed_booking_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  submission_id text,
  source_function text NOT NULL,
  error_message text,
  payload jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.failed_booking_intakes TO authenticated;
GRANT ALL ON public.failed_booking_intakes TO service_role;
ALTER TABLE public.failed_booking_intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office can view own org failed intakes" ON public.failed_booking_intakes
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()));
CREATE POLICY "Office can resolve own org failed intakes" ON public.failed_booking_intakes
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_my_org_id() AND public.has_office_access(auth.uid()))
  WITH CHECK (organisation_id = public.get_my_org_id());
CREATE INDEX failed_booking_intakes_org_open_idx ON public.failed_booking_intakes (organisation_id) WHERE resolved_at IS NULL;