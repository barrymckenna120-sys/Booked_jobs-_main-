CREATE TABLE public.boiler_catalogue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name text NOT NULL,
  model_name text NOT NULL,
  warranty_years integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX boiler_catalogue_brand_model_uniq
  ON public.boiler_catalogue (lower(btrim(brand_name)), lower(btrim(model_name)));

GRANT SELECT ON public.boiler_catalogue TO authenticated;
GRANT ALL ON public.boiler_catalogue TO service_role;

ALTER TABLE public.boiler_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read boiler catalogue"
  ON public.boiler_catalogue FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
  ));

INSERT INTO public.boiler_catalogue (brand_name, model_name, warranty_years) VALUES
  ('Baxi','600 Combi 2',7),
  ('Baxi','800 Combi',7),
  ('Baxi','400 Combi',7),
  ('Baxi','Assure 500',7),
  ('Baxi','Platinum',7),
  ('Baxi','Duo-tec',7),
  ('Baxi','EcoBlue',7),
  ('Ideal','Logic MAX Combi2',10),
  ('Ideal','Logic+ Combi',10),
  ('Ideal','Logic Max',10),
  ('Ideal','Logic Plus',12),
  ('Ideal','Logic Heat',10),
  ('Ideal','Logic Combi',10),
  ('Ideal','Vogue MAX',10),
  ('Ideal','Vogue Gen2',10),
  ('Ideal','Independent',10),
  ('Worcester Bosch','Greenstar 4000',12),
  ('Worcester Bosch','Greenstar 8000',12),
  ('Worcester Bosch','Greenstar 25i',10),
  ('Worcester Bosch','Greenstar 30i',10),
  ('Worcester Bosch','Greenstar Si',10),
  ('Worcester Bosch','Greenstar CDi',10),
  ('Worcester Bosch','Greenstar Ri',10),
  ('Worcester Bosch','Greenstar 2000',10),
  ('Vaillant','ecoFIT Pure',7),
  ('Vaillant','ecoTEC Plus',7),
  ('Vaillant','ecoTEC Pro',7),
  ('Vaillant','ecoTEC Exclusive',7),
  ('Vaillant','ecoTEC Sustain',7),
  ('Vaillant','ecoFIT Sustain',7),
  ('Viessmann','Vitodens 100',10),
  ('Viessmann','Vitodens 200',10),
  ('Viessmann','Vitodens 050',10),
  ('Viessmann','Vitodens 111',10),
  ('Vokèra','Unica',5),
  ('Vokèra','Vision',5),
  ('Vokèra','Evolve',5),
  ('Glow-worm','Energy',5),
  ('Glow-worm','Ultimate3',5),
  ('Glow-worm','Betacom4',5),
  ('Glow-worm','Easicom3',5);

CREATE OR REPLACE FUNCTION public.seed_boiler_brands(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted integer;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'seed_boiler_brands: _org_id is required';
  END IF;

  INSERT INTO public.boiler_brands (organisation_id, brand_name, model_name, warranty_years, is_default)
  SELECT _org_id, c.brand_name, c.model_name, c.warranty_years, true
  FROM public.boiler_catalogue c
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_boiler_brands(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_boiler_brands(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_boiler_brands(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_boiler_brands(uuid) TO service_role;

-- Backfill every existing organisation (additive; unique index from Step 1 prevents duplicates)
DO $$
DECLARE
  _org record;
BEGIN
  FOR _org IN SELECT id FROM public.organisations LOOP
    PERFORM public.seed_boiler_brands(_org.id);
  END LOOP;
END;
$$;