CREATE TABLE public.payment_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id uuid NOT NULL REFERENCES public.service_calls(id),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  checkout_id text NOT NULL,
  checkout_reference text NOT NULL,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.payment_checkout_attempts (service_call_id);
CREATE INDEX ON public.payment_checkout_attempts (checkout_reference);

GRANT ALL ON public.payment_checkout_attempts TO service_role;
ALTER TABLE public.payment_checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages payment checkout attempts"
ON public.payment_checkout_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);