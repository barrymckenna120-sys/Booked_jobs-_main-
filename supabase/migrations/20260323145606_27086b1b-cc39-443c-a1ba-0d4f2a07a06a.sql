
CREATE TABLE public.message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid,
  customer_id uuid REFERENCES public.customers(id),
  message_type text,
  channel text,
  direction text DEFAULT 'outbound',
  content text,
  status text DEFAULT 'pending',
  error_message text,
  related_id uuid,
  related_type text,
  sent_by text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read message_log"
  ON public.message_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert message_log"
  ON public.message_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update message_log"
  ON public.message_log FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
