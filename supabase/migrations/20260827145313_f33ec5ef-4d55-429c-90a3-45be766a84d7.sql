REVOKE ALL ON FUNCTION public.job_alert_recipients(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_alert_recipients(uuid, boolean) TO service_role;