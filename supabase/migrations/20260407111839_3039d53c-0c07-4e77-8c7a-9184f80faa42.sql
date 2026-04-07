ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS job_tag text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS job_tag_date date;