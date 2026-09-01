DROP FUNCTION IF EXISTS public.get_delivery_attempts(uuid);

CREATE OR REPLACE FUNCTION public.get_delivery_attempts(p_delivery_id uuid)
RETURNS TABLE(
  id uuid,
  attempt_number integer,
  outcome text,
  attempted_at timestamp with time zone,
  completed_at timestamp with time zone,
  accepted_at timestamp with time zone,
  delivered_at timestamp with time zone,
  recipient text,
  failure_reason_public text,
  trigger_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         a.attempt_number,
         a.outcome,
         a.attempted_at,
         a.completed_at,
         a.accepted_at,
         a.delivered_at,
         a.recipient,
         a.failure_reason_public,
         a.trigger_source
  FROM public.communication_delivery_attempts a
  JOIN public.communication_deliveries d ON d.id = a.delivery_id
  WHERE a.delivery_id = p_delivery_id
    AND d.organisation_id = public.get_my_org_id()
  ORDER BY a.attempt_number DESC
$$;

REVOKE ALL ON FUNCTION public.get_delivery_attempts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_delivery_attempts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_attempts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_attempts(uuid) TO service_role;