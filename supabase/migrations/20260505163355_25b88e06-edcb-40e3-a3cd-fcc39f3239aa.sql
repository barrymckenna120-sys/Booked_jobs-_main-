
DROP POLICY IF EXISTS "Authenticated users can update certificates" ON public.certificates;

DROP POLICY IF EXISTS job_media_update_own ON public.job_media;
CREATE POLICY job_media_update_own ON public.job_media
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT sc.user_id FROM public.service_calls sc WHERE sc.id = job_media.job_id)
  OR EXISTS (
    SELECT 1 FROM public.service_calls sc
    WHERE sc.id = job_media.job_id
    AND sc.assigned_engineer_id = public.get_engineer_id(auth.uid())
  )
);

DROP POLICY IF EXISTS job_media_delete_own ON public.job_media;
CREATE POLICY job_media_delete_own ON public.job_media
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT sc.user_id FROM public.service_calls sc WHERE sc.id = job_media.job_id)
  OR EXISTS (
    SELECT 1 FROM public.service_calls sc
    WHERE sc.id = job_media.job_id
    AND sc.assigned_engineer_id = public.get_engineer_id(auth.uid())
  )
);

DROP POLICY IF EXISTS admins_read_org_audit ON public.audit_log;
CREATE POLICY admins_read_org_audit ON public.audit_log
FOR SELECT TO authenticated
USING (organisation_id = public.get_user_organisation_id(auth.uid()));
