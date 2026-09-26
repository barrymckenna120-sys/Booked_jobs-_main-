-- BJ-NEW-S Step 1: dedupe boiler_brands and prevent future duplicates
-- Keeps the OLDEST row per normalised (organisation_id, brand, model) key.
-- Tie-break: created_at ASC, then id ASC.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY
             organisation_id,
             lower(regexp_replace(brand_name, '[^a-zA-Z0-9]', '', 'g')),
             lower(regexp_replace(coalesce(model_name, ''), '[^a-zA-Z0-9]', '', 'g'))
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
  FROM public.boiler_brands
)
DELETE FROM public.boiler_brands b
USING ranked r
WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX boiler_brands_org_brand_model_uniq
ON public.boiler_brands (
  organisation_id,
  lower(regexp_replace(brand_name, '[^a-zA-Z0-9]', '', 'g')),
  lower(regexp_replace(coalesce(model_name, ''), '[^a-zA-Z0-9]', '', 'g'))
);
