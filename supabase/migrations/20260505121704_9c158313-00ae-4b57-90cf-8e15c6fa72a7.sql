
-- 1. invoice_line_items: scope by parent invoice ownership/org
DROP POLICY IF EXISTS "Authenticated users can manage invoice line items" ON public.invoice_line_items;

CREATE POLICY "Users can read invoice line items in their org"
ON public.invoice_line_items FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_line_items.invoice_id
    AND (i.user_id = auth.uid() OR i.organisation_id = public.get_user_organisation_id(auth.uid()))
));

CREATE POLICY "Users can insert invoice line items in their org"
ON public.invoice_line_items FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_line_items.invoice_id
    AND (i.user_id = auth.uid() OR i.organisation_id = public.get_user_organisation_id(auth.uid()))
));

CREATE POLICY "Users can update invoice line items in their org"
ON public.invoice_line_items FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_line_items.invoice_id
    AND (i.user_id = auth.uid() OR i.organisation_id = public.get_user_organisation_id(auth.uid()))
));

CREATE POLICY "Users can delete invoice line items in their org"
ON public.invoice_line_items FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_line_items.invoice_id
    AND (i.user_id = auth.uid() OR i.organisation_id = public.get_user_organisation_id(auth.uid()))
));

-- 2. quote_line_items: scope by parent quote ownership
DROP POLICY IF EXISTS "Authenticated users can manage quote line items" ON public.quote_line_items;

CREATE POLICY "Users can read quote line items they own"
ON public.quote_line_items FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q
  WHERE q.id = quote_line_items.quote_id
    AND (q.user_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.engineers e
           WHERE e.auth_user_id = auth.uid()
             AND e.user_id = q.user_id
         ))
));

CREATE POLICY "Users can insert quote line items they own"
ON public.quote_line_items FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.quotes q
  WHERE q.id = quote_line_items.quote_id
    AND (q.user_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.engineers e
           WHERE e.auth_user_id = auth.uid()
             AND e.user_id = q.user_id
         ))
));

CREATE POLICY "Users can update quote line items they own"
ON public.quote_line_items FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q
  WHERE q.id = quote_line_items.quote_id
    AND (q.user_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.engineers e
           WHERE e.auth_user_id = auth.uid()
             AND e.user_id = q.user_id
         ))
));

CREATE POLICY "Users can delete quote line items they own"
ON public.quote_line_items FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q
  WHERE q.id = quote_line_items.quote_id
    AND (q.user_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.engineers e
           WHERE e.auth_user_id = auth.uid()
             AND e.user_id = q.user_id
         ))
));

-- 3. customers: drop the broad org-wide read so role-scoped policy applies
DROP POLICY IF EXISTS "authenticated_users_can_read_customers" ON public.customers;

-- Add an additional SELECT for office/admin/owner so they retain full org visibility
CREATE POLICY "Office and admins can read customers in their org"
ON public.customers FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('admin','office','owner','manager')
  AND (
    organisation_id = public.get_user_organisation_id(auth.uid())
    OR organisation_id = (SELECT id FROM public.organisations WHERE owner_user_id = auth.uid() LIMIT 1)
    OR user_id = auth.uid()
  )
);

-- 4. audit_log: admins can read all entries in their org
DROP POLICY IF EXISTS "admin_read_audit" ON public.audit_log;

CREATE POLICY "admins_read_org_audit"
ON public.audit_log FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = 'admin'
  AND (
    organisation_id = public.get_user_organisation_id(auth.uid())
    OR organisation_id = (SELECT id FROM public.organisations WHERE owner_user_id = auth.uid() LIMIT 1)
    OR user_id = auth.uid()
  )
);

-- 5. categories: split read vs write; only admin/office can mutate
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;

CREATE POLICY "Authenticated users can read categories"
ON public.categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/office can insert categories"
ON public.categories FOR INSERT TO authenticated
WITH CHECK (get_user_role(auth.uid()) IN ('admin','office','owner','manager'));

CREATE POLICY "Admin/office can update categories"
ON public.categories FOR UPDATE TO authenticated
USING (get_user_role(auth.uid()) IN ('admin','office','owner','manager'));

CREATE POLICY "Admin/office can delete categories"
ON public.categories FOR DELETE TO authenticated
USING (get_user_role(auth.uid()) IN ('admin','office','owner','manager'));

-- 6. products: same pattern
DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;

CREATE POLICY "Authenticated users can read products"
ON public.products FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/office can insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (get_user_role(auth.uid()) IN ('admin','office','owner','manager'));

CREATE POLICY "Admin/office can update products"
ON public.products FOR UPDATE TO authenticated
USING (get_user_role(auth.uid()) IN ('admin','office','owner','manager'));

CREATE POLICY "Admin/office can delete products"
ON public.products FOR DELETE TO authenticated
USING (get_user_role(auth.uid()) IN ('admin','office','owner','manager'));

-- 7. conversations: add org-scoped read for authenticated office/admin
CREATE POLICY "Office and admins can read conversations in their org"
ON public.conversations FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('admin','office','owner','manager')
  AND (
    organisation_id = public.get_user_organisation_id(auth.uid())
    OR organisation_id = (SELECT id FROM public.organisations WHERE owner_user_id = auth.uid() LIMIT 1)
  )
);

-- 8. job-media bucket: remove anon access, require authenticated
DROP POLICY IF EXISTS "Anyone can upload job media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view job media" ON storage.objects;

CREATE POLICY "Authenticated users can view job media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'job-media');

CREATE POLICY "Authenticated users can upload job media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-media');

-- 9. Improve get_user_organisation_id to handle owners and profile-linked users
CREATE OR REPLACE FUNCTION public.get_user_organisation_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT organisation_id FROM public.engineers WHERE auth_user_id = _user_id LIMIT 1),
    (SELECT id FROM public.organisations WHERE owner_user_id = _user_id LIMIT 1)
  );
$$;
