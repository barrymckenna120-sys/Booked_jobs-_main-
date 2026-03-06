CREATE POLICY "engineer_insert_notes"
ON public.customer_call_notes
FOR INSERT
TO authenticated
WITH CHECK (
  (get_user_role(auth.uid()) = 'engineer')
  AND (customer_id IN (
    SELECT customer_id FROM service_calls
    WHERE assigned_engineer_id = get_engineer_id(auth.uid())
  ))
);