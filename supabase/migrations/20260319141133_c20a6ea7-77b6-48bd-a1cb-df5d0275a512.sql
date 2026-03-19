CREATE POLICY "Admins can read logs"
  ON public.edge_function_logs
  FOR SELECT
  TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'office'));

CREATE POLICY "Admins can delete logs"
  ON public.edge_function_logs
  FOR DELETE
  TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'office'));