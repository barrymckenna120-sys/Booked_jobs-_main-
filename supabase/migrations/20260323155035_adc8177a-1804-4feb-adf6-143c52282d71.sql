
-- Create certificates storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', true);

-- Allow authenticated users to upload to certificates bucket
CREATE POLICY "Authenticated users can upload certificates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'certificates');

-- Allow public read access
CREATE POLICY "Public can read certificates"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'certificates');

-- Allow authenticated update on message_log for certificate PDF URL updates
CREATE POLICY "Authenticated users can update certificates"
ON public.certificates FOR UPDATE TO authenticated
USING (
  job_id IN (SELECT id FROM public.service_calls WHERE user_id = auth.uid())
  OR job_id IN (SELECT id FROM public.service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
);

-- Allow service role full access to certificates
CREATE POLICY "Service role full access certificates"
ON public.certificates FOR ALL TO service_role
USING (true) WITH CHECK (true);
