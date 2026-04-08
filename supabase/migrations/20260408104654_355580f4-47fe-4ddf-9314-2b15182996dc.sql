
-- Drop the unique constraint on brand_name
ALTER TABLE public.boiler_brands DROP CONSTRAINT IF EXISTS boiler_brands_brand_name_key;

-- Add new columns
ALTER TABLE public.boiler_brands
  ADD COLUMN IF NOT EXISTS model_name text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Mark all existing rows as brand defaults
UPDATE public.boiler_brands SET is_default = true WHERE model_name IS NULL;

-- Insert model overrides
INSERT INTO public.boiler_brands (organisation_id, brand_name, model_name, warranty_years, is_default)
VALUES
  ('8c37827f-ce2c-4507-a821-a5e807d89856', 'Worcester Bosch', 'Greenstar 8000', 12, false),
  ('8c37827f-ce2c-4507-a821-a5e807d89856', 'Worcester Bosch', 'Greenstar 4000', 12, false),
  ('8c37827f-ce2c-4507-a821-a5e807d89856', 'Ideal', 'Logic Plus', 12, false);
