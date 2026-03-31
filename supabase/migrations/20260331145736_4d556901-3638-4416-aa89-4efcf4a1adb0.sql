
ALTER TABLE public.service_calls ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.engineers ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.quotes ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.settings ALTER COLUMN organisation_id SET NOT NULL;
