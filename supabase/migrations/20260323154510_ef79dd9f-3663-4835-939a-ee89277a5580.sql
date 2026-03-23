
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.service_calls(id),
  customer_id uuid REFERENCES public.customers(id),
  cert_number text,
  checks jsonb,
  notes jsonb,
  readings jsonb,
  customer_sig_url text,
  engineer_sig_url text,
  pdf_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own certificates"
  ON public.certificates FOR SELECT TO authenticated
  USING (
    job_id IN (SELECT id FROM public.service_calls WHERE user_id = auth.uid())
    OR job_id IN (SELECT id FROM public.service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
  );

CREATE POLICY "Users can insert own certificates"
  ON public.certificates FOR INSERT TO authenticated
  WITH CHECK (
    job_id IN (SELECT id FROM public.service_calls WHERE user_id = auth.uid())
    OR job_id IN (SELECT id FROM public.service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
  );

CREATE POLICY "Users can update own certificates"
  ON public.certificates FOR UPDATE TO authenticated
  USING (
    job_id IN (SELECT id FROM public.service_calls WHERE user_id = auth.uid())
    OR job_id IN (SELECT id FROM public.service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
  )
  WITH CHECK (
    job_id IN (SELECT id FROM public.service_calls WHERE user_id = auth.uid())
    OR job_id IN (SELECT id FROM public.service_calls WHERE assigned_engineer_id = get_engineer_id(auth.uid()))
  );
