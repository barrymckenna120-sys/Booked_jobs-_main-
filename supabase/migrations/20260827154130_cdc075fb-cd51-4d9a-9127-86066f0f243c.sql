-- Categories tenant isolation, step 3: drop the shared-row carve-out now that all
-- categories are org-owned (verified: 0 rows with organisation_id IS NULL, 48 org rows).
DROP POLICY IF EXISTS "Users read own org or shared categories" ON public.categories;

CREATE POLICY "Users read categories in their org"
ON public.categories
FOR SELECT
TO authenticated
USING (organisation_id = public.get_my_org_id());

-- A category with no owner is no longer readable by anyone, so forbid creating one.
ALTER TABLE public.categories ALTER COLUMN organisation_id SET NOT NULL;