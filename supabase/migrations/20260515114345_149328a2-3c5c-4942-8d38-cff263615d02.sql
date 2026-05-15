-- 1. Add is_blocked column to organisations
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- 2. Allow authenticated admin users to insert into tenant_activity_log
CREATE POLICY "Admins can insert tenant_activity_log"
ON public.tenant_activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() = 'barrymckenna120@gmail.com'
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
  )
);

-- Allow them to read it too (so the UI can show the activity timeline)
CREATE POLICY "Admins can read tenant_activity_log"
ON public.tenant_activity_log
FOR SELECT
TO authenticated
USING (
  auth.email() = 'barrymckenna120@gmail.com'
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
  )
);
