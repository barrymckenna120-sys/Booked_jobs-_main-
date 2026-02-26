
-- Create audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now() NOT NULL,
  user_id      uuid NOT NULL,
  user_name    text NOT NULL,
  user_role    text NOT NULL,
  action_type  text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  detail       text NOT NULL,
  metadata     jsonb DEFAULT '{}'::jsonb
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_type_idx ON public.audit_log(action_type);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON public.audit_log(user_id);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert
CREATE POLICY "auth_insert_audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only admins can read (using existing get_user_role function)
CREATE POLICY "admin_read_audit" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');
