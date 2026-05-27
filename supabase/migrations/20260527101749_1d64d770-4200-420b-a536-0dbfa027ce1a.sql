
CREATE OR REPLACE FUNCTION public.next_org_invoice_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now() AT TIME ZONE 'Europe/Dublin', 'YYYY');
  v_prefix text;
  v_next int;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organisation_id required';
  END IF;

  v_prefix := 'INV-' || v_year || '-';

  PERFORM pg_advisory_xact_lock(
    hashtextextended('invoice_number_' || p_org_id::text, 0)
  );

  SELECT COALESCE(
    MAX(
      NULLIF(regexp_replace(invoice_number, '^' || v_prefix, ''), '')::int
    ),
    0
  ) + 1
  INTO v_next
  FROM public.service_calls
  WHERE organisation_id = p_org_id
    AND invoice_number ~ ('^' || v_prefix || '\d+$');

  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_org_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_org_invoice_number(uuid) TO authenticated;
