REVOKE EXECUTE ON FUNCTION public.has_office_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_office_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_office_access(uuid) TO authenticated, service_role;