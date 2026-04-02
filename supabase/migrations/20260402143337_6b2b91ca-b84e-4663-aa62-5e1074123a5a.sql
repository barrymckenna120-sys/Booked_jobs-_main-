CREATE POLICY "engineers_can_update_assigned_customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = 'engineer'
  AND id IN (
    SELECT customer_id FROM public.service_calls
    WHERE assigned_engineer_id = get_engineer_id(auth.uid())
  )
)
WITH CHECK (
  get_user_role(auth.uid()) = 'engineer'
  AND id IN (
    SELECT customer_id FROM public.service_calls
    WHERE assigned_engineer_id = get_engineer_id(auth.uid())
  )
);