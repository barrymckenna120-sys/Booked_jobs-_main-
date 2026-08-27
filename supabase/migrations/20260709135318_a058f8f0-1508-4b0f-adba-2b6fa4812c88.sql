-- 1. Add explicit prefix column
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS job_reference_prefix text;

-- 2. Backfill: explicit for K&N and Dublin Gas; derived for all others
UPDATE public.organisations
SET job_reference_prefix = 'KN'
WHERE lower(slug) LIKE 'kn%' OR lower(name) LIKE 'k&n%' OR lower(name) LIKE 'k %n%';

UPDATE public.organisations
SET job_reference_prefix = 'DG'
WHERE lower(slug) = 'dublin-gas' OR lower(name) LIKE 'dublin gas%';

UPDATE public.organisations
SET job_reference_prefix = upper(left(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'), 2))
WHERE job_reference_prefix IS NULL
  AND slug IS NOT NULL
  AND length(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g')) >= 2;

-- 3. Enforce NOT NULL + format
ALTER TABLE public.organisations
  ALTER COLUMN job_reference_prefix SET NOT NULL;

ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS job_reference_prefix_format;
ALTER TABLE public.organisations
  ADD CONSTRAINT job_reference_prefix_format
  CHECK (job_reference_prefix ~ '^[A-Z0-9]{2,6}$');

-- 4. Rewrite trigger function to read the column directly
CREATE OR REPLACE FUNCTION public.generate_job_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  IF NEW.job_reference IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organisation_id IS NULL THEN
    RAISE EXCEPTION 'generate_job_reference: organisation_id is required on service_calls';
  END IF;

  SELECT job_reference_prefix INTO v_prefix
  FROM public.organisations
  WHERE id = NEW.organisation_id;

  IF v_prefix IS NULL OR length(v_prefix) = 0 THEN
    RAISE EXCEPTION 'generate_job_reference: organisations.job_reference_prefix not set for org %', NEW.organisation_id;
  END IF;

  -- Serialize numbering per organisation to avoid duplicate refs under concurrent inserts
  PERFORM pg_advisory_xact_lock(
    hashtextextended('job_reference_' || NEW.organisation_id::text, 0)
  );

  SELECT COALESCE(
    MAX(
      NULLIF(regexp_replace(job_reference, '^' || v_prefix || '-', ''), '')::int
    ),
    0
  ) + 1
  INTO v_next
  FROM public.service_calls
  WHERE organisation_id = NEW.organisation_id
    AND job_reference ~ ('^' || v_prefix || '-\d+$');

  NEW.job_reference := v_prefix || '-' || LPAD(v_next::text, 3, '0');
  RETURN NEW;
END;
$function$;