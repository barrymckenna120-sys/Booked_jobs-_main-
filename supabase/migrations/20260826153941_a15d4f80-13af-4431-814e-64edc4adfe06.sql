CREATE UNIQUE INDEX IF NOT EXISTS service_calls_org_job_reference_key
  ON public.service_calls (organisation_id, job_reference)
  WHERE job_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_job_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  IF NEW.organisation_id IS NULL THEN
    RAISE EXCEPTION 'generate_job_reference: organisation_id is required on service_calls';
  END IF;

  SELECT job_reference_prefix INTO v_prefix
  FROM public.organisations
  WHERE id = NEW.organisation_id;

  IF v_prefix IS NULL OR length(v_prefix) = 0 THEN
    RAISE EXCEPTION 'generate_job_reference: organisations.job_reference_prefix not set for org %', NEW.organisation_id;
  END IF;

  -- An explicitly supplied reference must match this org's format, otherwise
  -- out-of-band values (e.g. DG-900) poison the sequence for every later job.
  IF NEW.job_reference IS NOT NULL THEN
    IF NEW.job_reference !~ ('^' || v_prefix || '-\d+$') THEN
      RAISE EXCEPTION 'generate_job_reference: invalid job_reference % for org % (expected %-NNN)',
        NEW.job_reference, NEW.organisation_id, v_prefix;
    END IF;
    RETURN NEW;
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
$$;