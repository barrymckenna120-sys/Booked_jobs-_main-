
-- Add receipts_counter to settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipts_counter integer NOT NULL DEFAULT 0;

-- Add receipt_number to service_calls
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS receipt_number text DEFAULT NULL;

-- Function to generate next receipt number atomically
CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_prefix text;
  v_receipt text;
BEGIN
  UPDATE public.settings
  SET receipts_counter = receipts_counter + 1
  WHERE user_id = p_user_id
  RETURNING receipts_counter, COALESCE(invoice_prefix, 'KG') INTO v_next, v_prefix;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Settings not found for user';
  END IF;

  v_receipt := v_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN v_receipt;
END;
$$;
