ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS receipt_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamp with time zone;