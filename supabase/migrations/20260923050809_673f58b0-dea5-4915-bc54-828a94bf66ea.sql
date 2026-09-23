REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_activity_logs() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.org_for_login_email(text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_activity_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.org_for_login_email(text) TO service_role;