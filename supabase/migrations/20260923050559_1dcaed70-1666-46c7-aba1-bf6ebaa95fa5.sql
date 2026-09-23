-- 1. Superadmin helper (mirrors SuperAdminRoute's profiles.role check)
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;

-- 2. Login/session activity log
CREATE TABLE public.auth_activity_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  outcome text NOT NULL DEFAULT 'success',
  failure_reason text,
  user_id uuid,
  email text,
  organisation_id uuid,
  ip inet,
  ip_truncated boolean NOT NULL DEFAULT false,
  browser text,
  browser_version text,
  os text,
  device_type text,
  display_mode text,
  user_agent text,
  app text,
  route text,
  metadata jsonb,
  CONSTRAINT auth_activity_events_event_type_check CHECK (
    event_type IN (
      'sign_in_success',
      'sign_in_failed',
      'sign_out',
      'password_reset_requested',
      'password_changed',
      'account_locked'
    )
  ),
  CONSTRAINT auth_activity_events_outcome_check CHECK (outcome IN ('success', 'failure'))
);

CREATE INDEX auth_activity_events_created_at_idx
  ON public.auth_activity_events (created_at DESC);
CREATE INDEX auth_activity_events_org_created_idx
  ON public.auth_activity_events (organisation_id, created_at DESC);
CREATE INDEX auth_activity_events_email_idx
  ON public.auth_activity_events (lower(email));

GRANT SELECT ON public.auth_activity_events TO authenticated;
GRANT ALL ON public.auth_activity_events TO service_role;

ALTER TABLE public.auth_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read login activity"
  ON public.auth_activity_events
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- 3. Who read the log
CREATE TABLE public.auth_activity_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  viewer_user_id uuid NOT NULL,
  filter_organisation_id uuid,
  filters jsonb
);

CREATE INDEX auth_activity_access_log_created_at_idx
  ON public.auth_activity_access_log (created_at DESC);

GRANT SELECT, INSERT ON public.auth_activity_access_log TO authenticated;
GRANT ALL ON public.auth_activity_access_log TO service_role;

ALTER TABLE public.auth_activity_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read the access log"
  ON public.auth_activity_access_log
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmins record their own access"
  ON public.auth_activity_access_log
  FOR INSERT
  TO authenticated
  WITH CHECK (viewer_user_id = auth.uid() AND public.is_superadmin(auth.uid()));

-- 4. Retention: one nightly function covering every log table
CREATE OR REPLACE FUNCTION public.purge_activity_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ip_masked integer := 0;
  events_deleted integer := 0;
  edge_deleted integer := 0;
  support_deleted integer := 0;
  access_deleted integer := 0;
BEGIN
  -- Full IP kept 90 days, then shortened (/24 IPv4, /48 IPv6)
  UPDATE public.auth_activity_events
     SET ip = CASE
                WHEN family(ip) = 4 THEN set_masklen(ip, 24)
                ELSE set_masklen(ip, 48)
              END,
         ip_truncated = true
   WHERE ip IS NOT NULL
     AND ip_truncated = false
     AND created_at < now() - interval '90 days';
  GET DIAGNOSTICS ip_masked = ROW_COUNT;

  DELETE FROM public.auth_activity_events
   WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS events_deleted = ROW_COUNT;

  DELETE FROM public.edge_function_logs
   WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS edge_deleted = ROW_COUNT;

  DELETE FROM public.support_reports
   WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS support_deleted = ROW_COUNT;

  DELETE FROM public.auth_activity_access_log
   WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS access_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ip_masked', ip_masked,
    'auth_events_deleted', events_deleted,
    'edge_function_logs_deleted', edge_deleted,
    'support_reports_deleted', support_deleted,
    'access_log_deleted', access_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_activity_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_activity_logs() TO service_role;

-- 5. Nightly schedule (pure SQL, no HTTP credentials involved)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-activity-logs')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-activity-logs');
    PERFORM cron.schedule(
      'purge-activity-logs',
      '20 3 * * *',
      $cron$SELECT public.purge_activity_logs();$cron$
    );
  END IF;
END;
$$;