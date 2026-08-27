CREATE OR REPLACE FUNCTION public.get_org_profile_directory()
RETURNS TABLE(user_id uuid, display_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name, p.role
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.organisation_id IS NOT NULL
    AND p.organisation_id = public.get_my_org_id();
$$;

REVOKE ALL ON FUNCTION public.get_org_profile_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_profile_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_profile_directory() TO service_role;