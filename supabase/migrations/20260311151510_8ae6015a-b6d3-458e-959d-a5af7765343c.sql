DROP POLICY "Authenticated users can insert job messages" ON job_messages;
DROP POLICY "Authenticated users can update job messages" ON job_messages;

CREATE POLICY "Authenticated users can insert job messages"
  ON job_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Authenticated users can update job messages"
  ON job_messages FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);