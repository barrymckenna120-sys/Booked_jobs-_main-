
-- Org-scope public.products
ALTER TABLE public.products ADD COLUMN organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE;

UPDATE public.products
SET organisation_id = '8c37827f-ce2c-4507-a821-a5e807d89856'
WHERE organisation_id IS NULL;

ALTER TABLE public.products ALTER COLUMN organisation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_organisation_id ON public.products(organisation_id);

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Admin/office can delete products" ON public.products;
DROP POLICY IF EXISTS "Admin/office can insert products" ON public.products;
DROP POLICY IF EXISTS "Admin/office can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;

-- Recreate org-scoped policies
CREATE POLICY "Users can read products in their org"
  ON public.products FOR SELECT
  TO authenticated
  USING (organisation_id = public.get_my_org_id());

CREATE POLICY "Admin/office/owner can insert products in their org"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    organisation_id = public.get_my_org_id()
    AND public.get_user_role(auth.uid()) IN ('admin','office','owner','superadmin')
  );

CREATE POLICY "Admin/office/owner can update products in their org"
  ON public.products FOR UPDATE
  TO authenticated
  USING (organisation_id = public.get_my_org_id())
  WITH CHECK (
    organisation_id = public.get_my_org_id()
    AND public.get_user_role(auth.uid()) IN ('admin','office','owner','superadmin')
  );

CREATE POLICY "Admin/office/owner can delete products in their org"
  ON public.products FOR DELETE
  TO authenticated
  USING (
    organisation_id = public.get_my_org_id()
    AND public.get_user_role(auth.uid()) IN ('admin','office','owner','superadmin')
  );
