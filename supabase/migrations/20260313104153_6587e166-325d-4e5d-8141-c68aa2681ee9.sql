ALTER TABLE public.service_calls
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS job_issue text,
  ADD COLUMN IF NOT EXISTS extra_details text,
  ADD COLUMN IF NOT EXISTS boiler_type text,
  ADD COLUMN IF NOT EXISTS boiler_error_code text,
  ADD COLUMN IF NOT EXISTS area_code text,
  ADD COLUMN IF NOT EXISTS owner_or_tenant text,
  ADD COLUMN IF NOT EXISTS access_notes text;