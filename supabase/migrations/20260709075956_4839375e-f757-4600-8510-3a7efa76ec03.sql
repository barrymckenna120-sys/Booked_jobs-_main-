
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS public_domain text;

UPDATE public.organisations SET public_domain = 'kngasservices.bookedjobs.ie' WHERE slug = 'kn-gas-services';
UPDATE public.organisations SET public_domain = 'dublin-gas.bookedjobs.ie' WHERE slug = 'dublin-gas';
