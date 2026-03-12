ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS follow_up_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_detail text;