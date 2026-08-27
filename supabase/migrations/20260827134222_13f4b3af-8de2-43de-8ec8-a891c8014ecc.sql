CREATE UNIQUE INDEX IF NOT EXISTS customer_activity_payment_failed_once
  ON public.customer_activity (service_call_id, ((event_data->>'checkout_id')))
  WHERE event_type = 'payment_failed' AND event_data->>'checkout_id' IS NOT NULL;