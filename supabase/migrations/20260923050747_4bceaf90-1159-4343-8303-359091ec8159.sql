CREATE OR REPLACE FUNCTION public.org_for_login_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.organisation_id
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE lower(u.email) = lower(trim(_email))
  ORDER BY p.created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.org_for_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_for_login_email(text) TO service_role;