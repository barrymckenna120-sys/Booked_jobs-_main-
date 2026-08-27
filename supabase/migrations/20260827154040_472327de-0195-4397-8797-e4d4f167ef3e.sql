-- Categories tenant isolation, step 1: scope every write policy to the caller's organisation.
-- Previously INSERT/UPDATE/DELETE checked role only, so any admin/office/owner/manager
-- in any tenant could rename or delete any category row, including another tenant's.
-- SELECT is intentionally left unchanged in this step (shared NULL rows still readable).

DROP POLICY IF EXISTS "Admin/office can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admin/office can update categories" ON public.categories;
DROP POLICY IF EXISTS "Admin/office can delete categories" ON public.categories;

CREATE POLICY "Admin/office can insert categories in their org"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text, 'owner'::text, 'manager'::text])
);

CREATE POLICY "Admin/office can update categories in their org"
ON public.categories
FOR UPDATE
TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text, 'owner'::text, 'manager'::text])
)
WITH CHECK (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text, 'owner'::text, 'manager'::text])
);

CREATE POLICY "Admin/office can delete categories in their org"
ON public.categories
FOR DELETE
TO authenticated
USING (
  organisation_id = public.get_my_org_id()
  AND public.get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text, 'owner'::text, 'manager'::text])
);