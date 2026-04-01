
-- Create independent invoice number sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;

-- Create function to generate invoice numbers
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  next_val INT;
  year_str TEXT;
BEGIN
  next_val := nextval('invoice_number_seq');
  year_str := TO_CHAR(NOW(), 'YYYY');
  RETURN 'INV-' || year_str || '-' || LPAD(next_val::TEXT, 4, '0');
END;
$function$;

-- Add invoice_number column to service_calls
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS invoice_number text;
