
-- 1) Prevent role self-escalation on engineers
CREATE OR REPLACE FUNCTION public.prevent_engineer_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF public.get_user_role(auth.uid()) NOT IN ('admin','owner') THEN
      RAISE EXCEPTION 'Only admins can change engineer roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_engineer_role_escalation ON public.engineers;
CREATE TRIGGER trg_prevent_engineer_role_escalation
BEFORE UPDATE ON public.engineers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_engineer_role_escalation();

-- 2) Fix job-media storage policies (use storage.foldername(name), not c.name)
DROP POLICY IF EXISTS job_media_select_own_org ON storage.objects;
DROP POLICY IF EXISTS job_media_insert_own_org ON storage.objects;
DROP POLICY IF EXISTS job_media_delete_own_org ON storage.objects;

CREATE POLICY job_media_select_own_org ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.organisation_id = public.get_my_org_id()
  )
);

CREATE POLICY job_media_insert_own_org ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.organisation_id = public.get_my_org_id()
  )
);

CREATE POLICY job_media_delete_own_org ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.organisation_id = public.get_my_org_id()
  )
);

-- 3) Restrict service_call_tags SELECT to caller's organisation
DROP POLICY IF EXISTS "Authenticated users can read service_call_tags" ON public.service_call_tags;

CREATE POLICY "Org members can read service_call_tags"
ON public.service_call_tags
FOR SELECT
TO authenticated
USING (
  service_call_id IN (
    SELECT id FROM public.service_calls
    WHERE organisation_id = public.get_user_organisation_id(auth.uid())
       OR user_id = auth.uid()
  )
);
