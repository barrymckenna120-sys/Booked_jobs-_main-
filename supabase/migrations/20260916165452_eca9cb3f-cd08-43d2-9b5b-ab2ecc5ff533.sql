CREATE TABLE public.booking_intake_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid NOT NULL,
  fingerprint text NOT NULL,
  service_call_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX booking_intake_claims_org_fingerprint_key
  ON public.booking_intake_claims (organisation_id, fingerprint);

CREATE INDEX booking_intake_claims_created_at_idx
  ON public.booking_intake_claims (created_at);

GRANT ALL ON public.booking_intake_claims TO service_role;

ALTER TABLE public.booking_intake_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to booking intake claims"
  ON public.booking_intake_claims
  FOR SELECT
  TO authenticated
  USING (false);