-- 1. boiler_brands: stop cross-tenant sharing via is_default (it flags brand vs model rows, not platform seeds)
ALTER TABLE public.boiler_brands ALTER COLUMN organisation_id SET DEFAULT public.get_my_org_id();

DROP POLICY IF EXISTS "Users read own org boiler_brands or defaults" ON public.boiler_brands;
CREATE POLICY "Users read own org boiler_brands"
ON public.boiler_brands FOR SELECT TO authenticated
USING (organisation_id IS NULL OR organisation_id = public.get_my_org_id());

-- 2. job_tags / categories: add owning organisation; existing rows stay NULL = shared platform seeds
ALTER TABLE public.job_tags
  ADD COLUMN IF NOT EXISTS organisation_id uuid DEFAULT public.get_my_org_id() REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS organisation_id uuid DEFAULT public.get_my_org_id() REFERENCES public.organisations(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Authenticated users can read job_tags" ON public.job_tags;
CREATE POLICY "Users read own org or shared job_tags"
ON public.job_tags FOR SELECT TO authenticated
USING (organisation_id IS NULL OR organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "Authenticated users can read categories" ON public.categories;
CREATE POLICY "Users read own org or shared categories"
ON public.categories FOR SELECT TO authenticated
USING (organisation_id IS NULL OR organisation_id = public.get_my_org_id());

-- 3. Remove anonymous-reachable policies on token-bearing / PII tables (public role includes anon).
--    Public customer-facing reads go through SECURITY DEFINER RPCs, which are unaffected.
DROP POLICY IF EXISTS "certificates_org_isolation" ON public.certificates;
CREATE POLICY "certificates_org_isolation"
ON public.certificates FOR ALL TO authenticated
USING (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "certificates_insert" ON public.certificates;
CREATE POLICY "certificates_insert"
ON public.certificates FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "cert2_certificates_insert" ON public.cert2_certificates;
CREATE POLICY "cert2_certificates_insert"
ON public.cert2_certificates FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "hazard_notifications_org_isolation" ON public.hazard_notifications;
CREATE POLICY "hazard_notifications_org_isolation"
ON public.hazard_notifications FOR ALL TO authenticated
USING (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "hazard_notifications_insert" ON public.hazard_notifications;
CREATE POLICY "hazard_notifications_insert"
ON public.hazard_notifications FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "quotes_org_isolation" ON public.quotes;
CREATE POLICY "quotes_org_isolation"
ON public.quotes FOR ALL TO authenticated
USING (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "quotes_insert" ON public.quotes;
CREATE POLICY "quotes_insert"
ON public.quotes FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "service_calls_org_isolation" ON public.service_calls;
CREATE POLICY "service_calls_org_isolation"
ON public.service_calls FOR ALL TO authenticated
USING (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "service_calls_insert" ON public.service_calls;
CREATE POLICY "service_calls_insert"
ON public.service_calls FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select"
ON public.invoices FOR SELECT TO authenticated
USING (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
CREATE POLICY "invoices_insert"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "invoices_update" ON public.invoices;
CREATE POLICY "invoices_update"
ON public.invoices FOR UPDATE TO authenticated
USING (organisation_id = public.get_my_org_id())
WITH CHECK (organisation_id = public.get_my_org_id());

DROP POLICY IF EXISTS "invoices_delete" ON public.invoices;
CREATE POLICY "invoices_delete"
ON public.invoices FOR DELETE TO authenticated
USING (organisation_id = public.get_my_org_id());

-- 4. Ensure anon cannot reach these tables through the Data API at all.
REVOKE ALL ON public.certificates FROM anon;
REVOKE ALL ON public.cert2_certificates FROM anon;
REVOKE ALL ON public.hazard_notifications FROM anon;
REVOKE ALL ON public.quotes FROM anon;
REVOKE ALL ON public.service_calls FROM anon;
REVOKE ALL ON public.invoices FROM anon;
REVOKE ALL ON public.boiler_brands FROM anon;
REVOKE ALL ON public.job_tags FROM anon;
REVOKE ALL ON public.categories FROM anon;