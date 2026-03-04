
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.service_calls(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS role text DEFAULT 'engineer';
