CREATE OR REPLACE FUNCTION public.derive_area_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ec text;
  v_prefix text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.eircode IS NOT DISTINCT FROM OLD.eircode THEN
    RETURN NEW;
  END IF;
  v_ec := upper(btrim(coalesce(NEW.eircode, '')));
  IF v_ec = '' THEN
    RETURN NEW;
  END IF;
  v_prefix := substring(v_ec from '^(D[0-9]{1,2}W?)');
  IF v_prefix IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.area_code := v_prefix;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_derive_area_code ON public.customers;

CREATE TRIGGER customers_derive_area_code
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.derive_area_code();