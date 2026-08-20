ALTER TABLE public.service_calls
  ADD COLUMN customer_status_at_booking text;

ALTER TABLE public.service_calls
  ADD CONSTRAINT service_calls_customer_status_at_booking_check
  CHECK (customer_status_at_booking IS NULL
         OR customer_status_at_booking IN ('new', 'existing'));