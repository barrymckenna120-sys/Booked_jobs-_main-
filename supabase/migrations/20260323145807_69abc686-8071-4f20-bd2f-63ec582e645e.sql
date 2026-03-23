
CREATE POLICY "Authenticated users can insert message_log"
  ON public.message_log FOR INSERT
  TO authenticated
  WITH CHECK (true);
