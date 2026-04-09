
CREATE TABLE public.debug_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  engineer_id uuid,
  job_id text,
  event text NOT NULL,
  payload jsonb,
  stack text
);

ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert debug_logs"
  ON public.debug_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin/office can read debug_logs"
  ON public.debug_logs FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'office'));

CREATE POLICY "Admin/office can delete debug_logs"
  ON public.debug_logs FOR DELETE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'office'));

CREATE POLICY "Service role full access debug_logs"
  ON public.debug_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
