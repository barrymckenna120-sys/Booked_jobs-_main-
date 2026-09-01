CREATE TABLE public.communication_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  customer_id uuid,
  comm_type text NOT NULL,
  channel text NOT NULL,
  related_type text,
  related_id uuid,
  related_reference text,
  delivery_status text NOT NULL DEFAULT 'pending',
  recipient text,
  attempt_count integer NOT NULL DEFAULT 0,
  failure_reason_public text,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  resolved_at timestamptz,
  in_flight boolean NOT NULL DEFAULT false,
  in_flight_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_deliveries_status_chk
    CHECK (delivery_status IN ('pending','sent','failed','opted_out')),
  CONSTRAINT communication_deliveries_channel_chk
    CHECK (channel IN ('whatsapp','email','sms'))
);

GRANT SELECT, UPDATE ON public.communication_deliveries TO authenticated;
GRANT ALL ON public.communication_deliveries TO service_role;

ALTER TABLE public.communication_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own delivery records"
ON public.communication_deliveries FOR SELECT TO authenticated
USING (organisation_id = public.get_my_org_id());

CREATE POLICY "Superadmins read all delivery records"
ON public.communication_deliveries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'superadmin'));

CREATE UNIQUE INDEX communication_deliveries_related_uniq
ON public.communication_deliveries (organisation_id, comm_type, channel, related_id)
WHERE related_id IS NOT NULL;

CREATE INDEX communication_deliveries_org_status_idx
ON public.communication_deliveries (organisation_id, delivery_status, last_attempt_at DESC);

CREATE INDEX communication_deliveries_related_lookup_idx
ON public.communication_deliveries (organisation_id, related_type, related_id);

CREATE INDEX communication_deliveries_customer_idx
ON public.communication_deliveries (organisation_id, customer_id);

CREATE TRIGGER communication_deliveries_updated_at
BEFORE UPDATE ON public.communication_deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.communication_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.communication_deliveries(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  outcome text NOT NULL DEFAULT 'pending',
  recipient text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_reason_public text,
  provider_error text,
  provider_message_id text,
  trigger_source text NOT NULL DEFAULT 'initial',
  triggered_by uuid,
  alert_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_delivery_attempts_outcome_chk
    CHECK (outcome IN ('pending','sent','failed','opted_out')),
  CONSTRAINT communication_delivery_attempts_number_uniq
    UNIQUE (delivery_id, attempt_number)
);

GRANT ALL ON public.communication_delivery_attempts TO service_role;

ALTER TABLE public.communication_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins read all delivery attempts"
ON public.communication_delivery_attempts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'superadmin'));

CREATE INDEX communication_delivery_attempts_delivery_idx
ON public.communication_delivery_attempts (delivery_id, attempt_number DESC);

CREATE INDEX communication_delivery_attempts_alert_idx
ON public.communication_delivery_attempts (outcome, alert_sent_at)
WHERE outcome = 'failed';

CREATE OR REPLACE FUNCTION public.get_delivery_attempts(p_delivery_id uuid)
RETURNS TABLE(
  id uuid,
  attempt_number integer,
  outcome text,
  attempted_at timestamptz,
  completed_at timestamptz,
  failure_reason_public text,
  trigger_source text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.attempt_number, a.outcome, a.attempted_at, a.completed_at,
         a.failure_reason_public, a.trigger_source
  FROM public.communication_delivery_attempts a
  JOIN public.communication_deliveries d ON d.id = a.delivery_id
  WHERE a.delivery_id = p_delivery_id
    AND (
      d.organisation_id = public.get_my_org_id()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'superadmin')
    )
  ORDER BY a.attempt_number ASC;
$$;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS delivery_failure_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_failure_alert_mode text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS delivery_failure_alert_email text,
  ADD COLUMN IF NOT EXISTS delivery_alerts_quotes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_alerts_invoices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_alerts_receipts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_alerts_service_reminders boolean NOT NULL DEFAULT false;