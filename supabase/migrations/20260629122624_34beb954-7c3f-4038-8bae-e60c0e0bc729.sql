REVOKE UPDATE (role) ON public.profiles FROM authenticated;
REVOKE UPDATE (role, can_access_office, status) ON public.engineers FROM authenticated;