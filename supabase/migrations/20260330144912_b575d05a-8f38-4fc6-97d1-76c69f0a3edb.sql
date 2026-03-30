ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS reminder_30day_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_14day_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2day_sent boolean NOT NULL DEFAULT false;