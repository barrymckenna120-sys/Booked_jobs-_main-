-- Fix job-media storage policies: use storage.foldername(objects.name) instead of customer name
DROP POLICY IF EXISTS job_media_select_own_org ON storage.objects;
DROP POLICY IF EXISTS job_media_insert_own_org ON storage.objects;
DROP POLICY IF EXISTS job_media_delete_own_org ON storage.objects;

CREATE POLICY job_media_select_own_org ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[2]
      AND c.organisation_id = public.get_my_org_id()
  )
);

CREATE POLICY job_media_insert_own_org ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[2]
      AND c.organisation_id = public.get_my_org_id()
  )
);

CREATE POLICY job_media_delete_own_org ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[2]
      AND c.organisation_id = public.get_my_org_id()
  )
);

-- Tighten notifications SELECT: engineers can only read their own notifications;
-- admin/office can read all in their organisation.
DROP POLICY IF EXISTS notifications_select ON public.notifications;

CREATE POLICY notifications_select ON public.notifications
FOR SELECT TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND (
    recipient_user_id = auth.uid()
    OR public.get_user_role(auth.uid()) IN ('admin', 'owner', 'office')
  )
);
