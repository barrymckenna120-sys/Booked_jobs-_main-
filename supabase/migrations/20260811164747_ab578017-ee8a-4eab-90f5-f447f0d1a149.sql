CREATE TABLE public.sumup_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_id text NOT NULL UNIQUE,
  event_type text,
  organisation_id uuid REFERENCES public.organisations(id),
  service_call_id uuid REFERENCES public.service_calls(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.sumup_webhook_events TO service_role;

ALTER TABLE public.sumup_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages sumup webhook events"
ON public.sumup_webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);