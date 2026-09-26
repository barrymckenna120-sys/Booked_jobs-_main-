-- 1. Remove the invalid rows added by migration 20260926160641 (model rows wrongly flagged as brand rows)
DELETE FROM public.boiler_brands
WHERE is_default = true AND model_name IS NOT NULL
  AND created_at >= '2026-09-26 16:00:00+00';

-- 2. Replace the catalogue and function with the approved design
DROP FUNCTION IF EXISTS public.seed_boiler_brands(uuid);
DROP TABLE IF EXISTS public.boiler_catalogue;

CREATE TABLE public.boiler_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  model_name text NULL,
  warranty_years integer NOT NULL CHECK (warranty_years BETWEEN 1 AND 25),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX boiler_catalogue_brand_model_uniq ON public.boiler_catalogue (
  lower(regexp_replace(brand_name, '[^a-zA-Z0-9]', '', 'g')),
  lower(regexp_replace(coalesce(model_name, ''), '[^a-zA-Z0-9]', '', 'g'))
);

REVOKE ALL ON public.boiler_catalogue FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boiler_catalogue TO authenticated;
GRANT ALL ON public.boiler_catalogue TO service_role;
ALTER TABLE public.boiler_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin select boiler_catalogue" ON public.boiler_catalogue
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin insert boiler_catalogue" ON public.boiler_catalogue
  FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin update boiler_catalogue" ON public.boiler_catalogue
  FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin delete boiler_catalogue" ON public.boiler_catalogue
  FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));

CREATE TRIGGER update_boiler_catalogue_updated_at
  BEFORE UPDATE ON public.boiler_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.boiler_catalogue (brand_name, model_name, warranty_years) VALUES
  ('Baxi', NULL, 7),
  ('Baxi', '800 Combi', 7), ('Baxi', 'Platinum', 7), ('Baxi', '200 Combi', 7),
  ('Baxi', '400 Combi', 7), ('Baxi', '600 Combi', 7), ('Baxi', 'Assure', 7), ('Baxi', 'Duo-tec', 7),
  ('Ideal', NULL, 10),
  ('Ideal', 'Logic Heat', 10), ('Ideal', 'Logic Max', 10), ('Ideal', 'Logic Plus', 12),
  ('Ideal', 'Vogue', 10), ('Ideal', 'Vogue Max', 10), ('Ideal', 'Exclusive', 10),
  ('Ideal', 'Instinct', 10), ('Ideal', 'Independent', 10),
  ('Vaillant', NULL, 7),
  ('Vaillant', 'ecoFIT Pure', 7), ('Vaillant', 'ecoTEC Plus', 7), ('Vaillant', 'ecoTEC Pro', 7),
  ('Vaillant', 'ecoTEC exclusive', 7), ('Vaillant', 'turboMAX', 7),
  ('Viessmann', NULL, 10),
  ('Viessmann', 'Vitodens 100', 10), ('Viessmann', 'Vitodens 200', 10),
  ('Viessmann', 'Vitodens 050-W', 10), ('Viessmann', 'Vitodens 111-W', 10),
  ('Vokèra', NULL, 5),
  ('Vokèra', 'Unica', 5), ('Vokèra', 'Evolve', 5), ('Vokèra', 'Vision', 5),
  ('Worcester Bosch', NULL, 10),
  ('Worcester Bosch', 'Greenstar 25i', 10), ('Worcester Bosch', 'Greenstar 30i', 10),
  ('Worcester Bosch', 'Greenstar Si', 10), ('Worcester Bosch', 'Greenstar 4000', 12),
  ('Worcester Bosch', 'Greenstar 8000', 12), ('Worcester Bosch', 'Greenstar 2000', 10),
  ('Worcester Bosch', 'Greenstar Ri', 10), ('Worcester Bosch', 'Greenstar CDi Classic', 10);

CREATE OR REPLACE FUNCTION public.seed_boiler_brands(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = _org_id) THEN
    RAISE EXCEPTION 'Organisation % does not exist', _org_id;
  END IF;

  INSERT INTO public.boiler_brands (organisation_id, brand_name, model_name, warranty_years, is_default)
  SELECT _org_id, c.brand_name, c.model_name, c.warranty_years, (c.model_name IS NULL)
  FROM public.boiler_catalogue c
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_boiler_brands(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_boiler_brands(uuid) TO service_role;

-- 3. Re-backfill every organisation (additive only)
SELECT public.seed_boiler_brands(id) FROM public.organisations;