
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_val INT;
  year_str TEXT;
BEGIN
  next_val := nextval('quote_number_seq');
  year_str := TO_CHAR(NOW(), 'YYYY');
  RETURN 'Q-' || year_str || '-' || LPAD(next_val::TEXT, 4, '0');
END;
$$;
