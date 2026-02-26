
-- 1. Add auth_user_id to engineers (links engineer record to their auth account)
ALTER TABLE public.engineers 
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;

-- 2. Add assigned_engineer_id to service_calls (UUID-based assignment)
ALTER TABLE public.service_calls 
  ADD COLUMN IF NOT EXISTS assigned_engineer_id uuid REFERENCES public.engineers(id);

-- 3. Create get_user_role function (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
    'admin'
  );
$$;

-- 4. Get engineer_id for a given auth user
CREATE OR REPLACE FUNCTION public.get_engineer_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1;
$$;

-- 5. Update service_calls RLS policies
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Users can insert their own service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Users can update their own service_calls" ON public.service_calls;
DROP POLICY IF EXISTS "Users can delete their own service_calls" ON public.service_calls;

-- Admins/office see all jobs they own; engineers see only assigned jobs
CREATE POLICY "service_calls_select" ON public.service_calls
  FOR SELECT USING (
    CASE public.get_user_role(auth.uid())
      WHEN 'engineer' THEN assigned_engineer_id = public.get_engineer_id(auth.uid())
      ELSE auth.uid() = user_id
    END
  );

CREATE POLICY "service_calls_insert" ON public.service_calls
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'office')
    AND auth.uid() = user_id
  );

CREATE POLICY "service_calls_update" ON public.service_calls
  FOR UPDATE USING (
    CASE public.get_user_role(auth.uid())
      WHEN 'engineer' THEN assigned_engineer_id = public.get_engineer_id(auth.uid())
      ELSE auth.uid() = user_id
    END
  );

CREATE POLICY "service_calls_delete" ON public.service_calls
  FOR DELETE USING (
    public.get_user_role(auth.uid()) IN ('admin', 'office')
    AND auth.uid() = user_id
  );

-- 6. Update customers RLS — engineers can view customers for their assigned jobs
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;

CREATE POLICY "customers_select" ON public.customers
  FOR SELECT USING (
    CASE public.get_user_role(auth.uid())
      WHEN 'engineer' THEN id IN (
        SELECT customer_id FROM public.service_calls 
        WHERE assigned_engineer_id = public.get_engineer_id(auth.uid())
      )
      ELSE auth.uid() = user_id
    END
  );
