CREATE OR REPLACE FUNCTION public.next_org_quote_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year text := to_char(now() AT TIME ZONE 'Europe/Dublin', 'YYYY');
  v_prefix text;
  v_next int;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organisation_id required';
  END IF;

  v_prefix := 'Q-' || v_year || '-';

  PERFORM pg_advisory_xact_lock(
    hashtextextended('quote_number_' || p_org_id::text, 0)
  );

  SELECT COALESCE(
    MAX(
      NULLIF(regexp_replace(quote_number, '^' || v_prefix, ''), '')::int
    ),
    0
  ) + 1
  INTO v_next
  FROM public.quotes
  WHERE organisation_id = p_org_id
    AND quote_number ~ ('^' || v_prefix || '\d+$');

  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_number IS NULL OR btrim(NEW.quote_number) = '' THEN
    IF NEW.organisation_id IS NULL THEN
      NEW.quote_number := public.generate_quote_number();
    ELSE
      NEW.quote_number := public.next_org_quote_number(NEW.organisation_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.quotes ALTER COLUMN quote_number DROP DEFAULT;

DROP TRIGGER IF EXISTS trg_set_quote_number ON public.quotes;
CREATE TRIGGER trg_set_quote_number
BEFORE INSERT ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.set_quote_number();