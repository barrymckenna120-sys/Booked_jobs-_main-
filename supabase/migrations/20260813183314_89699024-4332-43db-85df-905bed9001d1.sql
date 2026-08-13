-- SumUp delivers the same failure event more than once, often within the same
-- 100ms, so a read-then-insert dedupe in the function loses the race. This index
-- makes one alert per (recipient, job, checkout) a database guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_payment_failed_once
  ON public.notifications (recipient_user_id, job_id, (metadata->>'checkout_id'))
  WHERE notification_type = 'payment_failed';