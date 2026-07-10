
-- 1. Add access_token columns with unique indexes
ALTER TABLE public.certificates ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX certificates_access_token_key ON public.certificates(access_token);

ALTER TABLE public.cert2_certificates ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX cert2_certificates_access_token_key ON public.cert2_certificates(access_token);

ALTER TABLE public.quotes ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX quotes_access_token_key ON public.quotes(access_token);

ALTER TABLE public.service_calls ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX service_calls_access_token_key ON public.service_calls(access_token);

ALTER TABLE public.invoices ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX invoices_access_token_key ON public.invoices(access_token);

-- 3. Replace storage.objects SELECT policies (org-scoped). Buckets remain public in Stage 1;
-- these policies become the active enforcement once buckets are flipped private in Stage 2.
DROP POLICY IF EXISTS "Public can read certificates" ON storage.objects;
DROP POLICY IF EXISTS "Public read quote PDFs" ON storage.objects;

CREATE POLICY "Org members can read certificates"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

CREATE POLICY "Org members can read quote PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-pdfs'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );
