CREATE TABLE public.tenant_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_activity_log_org ON public.tenant_activity_log(organisation_id);

ALTER TABLE public.tenant_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to tenant_activity_log"
ON public.tenant_activity_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
