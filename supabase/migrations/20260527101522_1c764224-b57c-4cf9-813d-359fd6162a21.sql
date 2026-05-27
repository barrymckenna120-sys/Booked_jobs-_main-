
CREATE OR REPLACE FUNCTION public.generate_job_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_prefix text;
  v_next int;
BEGIN
  IF NEW.job_reference IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organisation_id IS NOT NULL THEN
    SELECT slug INTO v_slug
    FROM public.organisations
    WHERE id = NEW.organisation_id;

    IF v_slug IS NOT NULL AND length(v_slug) >= 2 THEN
      v_prefix := upper(left(regexp_replace(v_slug, '[^a-zA-Z0-9]', '', 'g'), 2));

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
    END IF;
  END IF;

  -- Fallback: legacy global sequence (no org or no slug)
  NEW.job_reference := 'KN-' || LPAD(nextval('job_reference_seq')::text, 3, '0');
  RETURN NEW;
END;
$$;
