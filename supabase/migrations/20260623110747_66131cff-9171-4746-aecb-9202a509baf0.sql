
-- 1. audit_log: drop ALL policy; keep insert + select
DROP POLICY IF EXISTS audit_log_org_isolation ON public.audit_log;

-- 2. business-logos storage: org-scoped write policies
DROP POLICY IF EXISTS "Users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete logos" ON storage.objects;

CREATE POLICY "Users can upload logos to own org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);

CREATE POLICY "Users can update logos in own org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
)
WITH CHECK (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);

CREATE POLICY "Users can delete logos in own org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);

-- 3. certificates bucket: org-scoped upload
DROP POLICY IF EXISTS "Authenticated users can upload certificates" ON storage.objects;

CREATE POLICY "Authenticated users can upload certificates to own org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);

-- 4. get_user_role: check profiles before fallback
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
    (SELECT role FROM public.profiles  WHERE user_id      = _user_id LIMIT 1),
    'engineer'
  );
$function$;
