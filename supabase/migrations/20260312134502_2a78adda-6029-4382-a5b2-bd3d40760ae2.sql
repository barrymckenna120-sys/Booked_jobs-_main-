
DROP POLICY "admin_read_audit" ON public.audit_log;
CREATE POLICY "admin_read_audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    AND user_id = auth.uid()
  );
