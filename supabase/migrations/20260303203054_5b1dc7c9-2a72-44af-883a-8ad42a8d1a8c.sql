
-- 1. Sanitize handle_new_user() SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  safe_display_name text;
BEGIN
  safe_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );
  -- Limit length
  safe_display_name := SUBSTRING(safe_display_name, 1, 100);

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, safe_display_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Protect audit_log from UPDATE and DELETE
CREATE POLICY "audit_log_no_update" ON public.audit_log FOR UPDATE USING (false);
CREATE POLICY "audit_log_no_delete" ON public.audit_log FOR DELETE USING (false);

-- 3. Fix job_media overly permissive RLS policies
DROP POLICY IF EXISTS "Authenticated users can view job media" ON public.job_media;
DROP POLICY IF EXISTS "Authenticated users can insert job media" ON public.job_media;
DROP POLICY IF EXISTS "Authenticated users can update job media" ON public.job_media;
DROP POLICY IF EXISTS "Authenticated users can delete job media" ON public.job_media;
DROP POLICY IF EXISTS "Anon can insert media records" ON public.job_media;

-- Owner or assigned engineer can view
CREATE POLICY "job_media_select_own" ON public.job_media FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT sc.user_id FROM service_calls sc WHERE sc.id = job_id
  )
  OR get_engineer_id(auth.uid()) IN (
    SELECT sc.assigned_engineer_id FROM service_calls sc WHERE sc.id = job_id
  )
);

-- Owner or assigned engineer can insert
CREATE POLICY "job_media_insert_own" ON public.job_media FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT sc.user_id FROM service_calls sc WHERE sc.id = job_id
  )
  OR get_engineer_id(auth.uid()) IN (
    SELECT sc.assigned_engineer_id FROM service_calls sc WHERE sc.id = job_id
  )
);

-- Only owner can update/delete
CREATE POLICY "job_media_update_own" ON public.job_media FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT sc.user_id FROM service_calls sc WHERE sc.id = job_id
  )
);

CREATE POLICY "job_media_delete_own" ON public.job_media FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT sc.user_id FROM service_calls sc WHERE sc.id = job_id
  )
);

-- Keep anon insert for tally webhook (service role bypasses RLS anyway, but keep explicit)
-- The tally webhook uses service_role key which bypasses RLS, so no anon policy needed.
