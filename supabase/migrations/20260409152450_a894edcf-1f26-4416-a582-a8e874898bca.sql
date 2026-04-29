-- Enable RLS (may already be enabled, safe to re-run)
ALTER TABLE public.customer_activity ENABLE ROW LEVEL SECURITY;

-- Office/admin full read access
CREATE POLICY "office_select_activity"
ON public.customer_activity
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('admin', 'office')
);

-- Office/admin insert
CREATE POLICY "office_insert_activity"
ON public.customer_activity
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('admin', 'office')
);

-- Engineer select for assigned customers
CREATE POLICY "engineer_select_activity"
ON public.customer_activity
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'engineer'
  AND customer_id IN (
    SELECT customer_id FROM service_calls
    WHERE assigned_engineer_id = get_engineer_id(auth.uid())
  )
);

-- Engineer insert for assigned customers
CREATE POLICY "engineer_insert_activity"
ON public.customer_activity
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) = 'engineer'
  AND customer_id IN (
    SELECT customer_id FROM service_calls
    WHERE assigned_engineer_id = get_engineer_id(auth.uid())
  )
);

-- Service role full access
CREATE POLICY "service_role_activity"
ON public.customer_activity
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);