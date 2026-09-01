CREATE OR REPLACE FUNCTION public.sweep_stale_accepted_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_reason constant text := 'Delivery not confirmed';
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  WITH swept AS (
    UPDATE public.communication_deliveries d
       SET delivery_status = 'delivery_unknown',
           failure_reason_public = v_reason,
           confirmation_due_at = NULL,
           in_flight = false,
           in_flight_at = NULL,
           resolved_at = COALESCE(d.resolved_at, now())
     WHERE d.delivery_status = 'accepted'
       AND d.confirmation_due_at IS NOT NULL
       AND d.confirmation_due_at <= now()
    RETURNING d.id
  )
  SELECT array_agg(id) INTO v_ids FROM swept;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  v_count := array_length(v_ids, 1);

  UPDATE public.communication_delivery_attempts a
     SET outcome = 'delivery_unknown',
         failure_reason_public = v_reason
   WHERE a.delivery_id = ANY(v_ids)
     AND a.outcome = 'accepted';

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sweep_stale_accepted_deliveries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_stale_accepted_deliveries() FROM anon;
REVOKE ALL ON FUNCTION public.sweep_stale_accepted_deliveries() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_stale_accepted_deliveries() TO postgres;

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'sweep-stale-accepted-deliveries-hourly';

SELECT cron.schedule(
  'sweep-stale-accepted-deliveries-hourly',
  '7 * * * *',
  $cron$SELECT public.sweep_stale_accepted_deliveries();$cron$
);