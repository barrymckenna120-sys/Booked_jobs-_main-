
-- 1. get_user_role: safe default
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
    'engineer'
  );
$function$;

-- 2. audit_log immutability: drop update/delete policies
DROP POLICY IF EXISTS audit_log_delete ON public.audit_log;
DROP POLICY IF EXISTS audit_log_update ON public.audit_log;

-- 3. booking_links: replace anon SELECT with token-based RPC
DROP POLICY IF EXISTS booking_links_public_lookup ON public.booking_links;

CREATE OR REPLACE FUNCTION public.get_booking_link_by_token(_token text)
RETURNS TABLE(full_url text, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT full_url, expires_at
  FROM public.booking_links
  WHERE token = _token
    AND expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_link_by_token(text) TO anon, authenticated;

-- 4. message_log: remove hardcoded-org anon insert policy
DROP POLICY IF EXISTS message_log_insert_kn_anon ON public.message_log;

-- 5. job-media storage: org-scoped policies
DROP POLICY IF EXISTS "Authenticated users can view job media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete job media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload job media" ON storage.objects;

CREATE POLICY "job_media_select_own_org"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-media'
  AND (
    (storage.foldername(name))[1] = 'cloudinary'
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id::text = (storage.foldername(name))[2]
        AND c.organisation_id = public.get_my_org_id()
    )
  )
);

CREATE POLICY "job_media_insert_own_org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-media'
  AND (
    (storage.foldername(name))[1] = 'cloudinary'
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id::text = (storage.foldername(name))[2]
        AND c.organisation_id = public.get_my_org_id()
    )
  )
);

CREATE POLICY "job_media_delete_own_org"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-media'
  AND (
    (storage.foldername(name))[1] = 'cloudinary'
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id::text = (storage.foldername(name))[2]
        AND c.organisation_id = public.get_my_org_id()
    )
  )
);
