ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS parts_priority text,
  ADD COLUMN IF NOT EXISTS parts_logged_at timestamptz;