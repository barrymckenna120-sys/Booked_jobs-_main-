
-- 1. Drop view that exposes auth.users (also resolves the security-definer-view warning)
DROP VIEW IF EXISTS public.current_user_email;

-- 2. Pin search_path on functions that were missing it
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_user_organisation_id(uuid) SET search_path = public;

-- 3. Tighten permissive RLS policies
-- debug_logs: restrict insert to signed-in users instead of WITH CHECK (true)
DROP POLICY IF EXISTS "Authenticated users can insert debug_logs" ON public.debug_logs;
CREATE POLICY "Authenticated users can insert debug_logs"
  ON public.debug_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Remove redundant service_role bypass policies (service_role bypasses RLS already)
DROP POLICY IF EXISTS "conversations_service_role_all" ON public.conversations;
DROP POLICY IF EXISTS "org_price_list_service_role_all" ON public.org_price_list;
DROP POLICY IF EXISTS "service_role_activity" ON public.customer_activity;
DROP POLICY IF EXISTS "Service role full access debug_logs" ON public.debug_logs;
DROP POLICY IF EXISTS "Service role bypass" ON public.tenant_integrations;
DROP POLICY IF EXISTS "Service role full access to tenant_activity_log" ON public.tenant_activity_log;
DROP POLICY IF EXISTS "booking_links_service_role_all" ON public.booking_links;
