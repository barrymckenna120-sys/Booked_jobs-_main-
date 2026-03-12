
ALTER TABLE public.job_messages ADD COLUMN recipient_id uuid;

-- Allow selecting direct messages where you are the recipient
DROP POLICY IF EXISTS "Authenticated users can read job messages" ON public.job_messages;
CREATE POLICY "Authenticated users can read job messages"
ON public.job_messages FOR SELECT TO authenticated
USING (true);
