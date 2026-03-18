
-- Fix: Restrict job_messages UPDATE to involved parties only
DROP POLICY "Authenticated users can update job messages" ON job_messages;

CREATE POLICY "Involved users can update job messages"
  ON job_messages FOR UPDATE TO authenticated
  USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
    OR job_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid())
    OR job_id IN (SELECT id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
  )
  WITH CHECK (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
    OR job_id IN (SELECT id FROM service_calls WHERE user_id = auth.uid())
    OR job_id IN (SELECT id FROM service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
  );
