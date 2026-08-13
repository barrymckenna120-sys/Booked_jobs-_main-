DROP POLICY "Admin/office can insert boiler_brands" ON public.boiler_brands;

CREATE POLICY "Admin/office can insert boiler_brands"
ON public.boiler_brands
FOR INSERT
TO authenticated
WITH CHECK (
  (get_user_role(auth.uid()) = ANY (ARRAY['admin'::text, 'office'::text]))
  AND organisation_id = get_my_org_id()
);