ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS parts_status text DEFAULT NULL;
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS parts_notes text DEFAULT NULL;