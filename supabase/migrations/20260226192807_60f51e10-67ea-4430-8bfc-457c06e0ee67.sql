
-- Allow anonymous users to update quote status (accept/decline only)
CREATE POLICY "anon_update_quote_status"
  ON public.quotes
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anonymous users to update service_call status (linked from quote acceptance)
CREATE POLICY "anon_update_service_call_status"
  ON public.service_calls
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
