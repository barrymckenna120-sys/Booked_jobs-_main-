-- Step 2e-i: settle the invoice record when its job is fully paid.
-- Today nothing ever moves invoices.status off 'unpaid', so invoice-level
-- reporting disagrees with the job. One trigger covers EVERY settlement path
-- (SumUp webhook, office modal, engineer app) rather than per-caller code.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on the transition INTO paid. A job that was already paid, or that
  -- is partial/unpaid, leaves the invoice exactly as it is.
  IF NEW.payment_status = 'paid'
     AND coalesce(OLD.payment_status, '') <> 'paid' THEN
    UPDATE public.invoices
       SET status = 'paid',
           paid_at = coalesce(NEW.paid_at, now()),
           balance_due = 0,
           updated_at = now()
     WHERE job_id = NEW.id
       AND status <> 'paid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_status_from_job ON public.service_calls;

CREATE TRIGGER trg_sync_invoice_status_from_job
AFTER UPDATE OF payment_status ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_status_from_job();