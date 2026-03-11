DROP POLICY "Authenticated users can read job messages" ON job_messages;
DROP POLICY "Authenticated users can insert job messages" ON job_messages;
DROP POLICY "Authenticated users can update job messages" ON job_messages;

CREATE POLICY "Authenticated users can read job messages"
  ON job_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job messages"
  ON job_messages FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job messages"
  ON job_messages FOR UPDATE TO authenticated
  USING (true);