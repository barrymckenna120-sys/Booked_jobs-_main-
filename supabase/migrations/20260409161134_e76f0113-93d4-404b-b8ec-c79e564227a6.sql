DROP TRIGGER IF EXISTS trg_log_payment_received_activity ON public.service_calls;
DROP FUNCTION IF EXISTS public.log_payment_received_activity();