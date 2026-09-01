REVOKE ALL ON FUNCTION public.get_delivery_attempts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_delivery_attempts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_delivery_attempts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_attempts(uuid) TO service_role;