CREATE POLICY job_media_select_boiler_enquiry_own_org ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media'
  AND (storage.foldername(name))[2] = 'boiler-enquiries'
  AND EXISTS (
    SELECT 1 FROM public.boiler_enquiries be
    WHERE be.id::text = (storage.foldername(objects.name))[3]
      AND be.organisation_id = public.get_my_org_id()
  )
);