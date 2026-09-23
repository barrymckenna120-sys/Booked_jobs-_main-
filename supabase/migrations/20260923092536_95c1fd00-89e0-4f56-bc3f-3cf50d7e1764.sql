ALTER TABLE public.boiler_enquiries
  ADD COLUMN IF NOT EXISTS existing_boiler_working text;