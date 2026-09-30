CREATE POLICY "Superadmins can view suppressed WhatsApp test messages"
ON public.message_log
FOR SELECT
TO authenticated
USING (
  status = 'suppressed_test_mode'
  AND public.is_superadmin(auth.uid())
);