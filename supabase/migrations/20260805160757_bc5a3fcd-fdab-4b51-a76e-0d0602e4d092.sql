ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'engineer';

DROP POLICY IF EXISTS profiles_insert ON public.profiles;

CREATE POLICY profiles_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'engineer'
  AND organisation_id IS NULL
);