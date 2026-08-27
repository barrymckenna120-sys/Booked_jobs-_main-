ALTER TABLE public.job_payments DROP CONSTRAINT job_payments_checkout_id_fkey;

CREATE UNIQUE INDEX idx_job_payments_sumup_checkout_unique
  ON public.job_payments (checkout_id)
  WHERE source = 'sumup_webhook';