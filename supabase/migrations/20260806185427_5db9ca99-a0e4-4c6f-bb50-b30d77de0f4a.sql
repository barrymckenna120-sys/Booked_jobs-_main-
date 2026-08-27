DROP POLICY IF EXISTS "Admin/office can update boiler_brands" ON public.boiler_brands;
DROP POLICY IF EXISTS "Admin/office can delete boiler_brands" ON public.boiler_brands;

CREATE POLICY "Admin/office can update boiler_brands"
ON public.boiler_brands
FOR UPDATE
TO authenticated
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])
  AND organisation_id = get_my_org_id()
)
WITH CHECK (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])
  AND organisation_id = get_my_org_id()
);

CREATE POLICY "Admin/office can delete boiler_brands"
ON public.boiler_brands
FOR DELETE
TO authenticated
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text])
  AND organisation_id = get_my_org_id()
);